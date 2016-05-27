'use strict';

var promisemodule = require('promise')

var mongo = require('mongodb');
var mongo_user = process.env.MONGOUSER;
var mongo_pass = process.env.MONGOPASS;
var murl = 'mongodb://'+mongo_user+':'+mongo_pass+'@ds011912.mlab.com:11912/anibotdb';
var mongoClient = mongo.MongoClient;
var db;

let util = require('util');
let http = require('http');
let Bot  = require('@kikinteractive/kik');
var request = require('request');

// anilist oauth
var ani_client_id = process.env.ANILISTCLIENTID;
var ani_client_secret = process.env.ANILISTCLIENTSECRET;
var ani_endpoint = "https://anilist.co/api/";
var ani_token = "";

// // kikbot auth
var botname = process.env.KIKBOTNAME;
var botkey = process.env.KIKBOTKEY;
var botUrl = process.env.KIKBOTURL;

var botsettings = {
  username: botname,
  apiKey: botkey,
  baseUrl: '/incoming'
};

var bothooksettings = {webhook: botUrl,
                       features: {}};

var CronJob = require('cron').CronJob;

function getNewAniToken(callback){
  var ani_refresh = {
    grant_type: "client_credentials",
    client_id: ani_client_id,
    client_secret: ani_client_secret
  };

  request.post({
    url: ani_endpoint+'auth/access_token',
    json: ani_refresh
    },
    function (error, response, body) {
      //Check for error
      if(error){
          return console.log('Error:', error);
      }

      //Check for right status code
      if(response.statusCode !== 200){
          return console.log('Invalid Status Code Returned:', response.statusCode);
      }

      //All is good. Print the body
      ani_token = body['access_token'];
      console.log('new token: ', ani_token);
      callback();
    }
  )
}

function browseAiring(attempt, callback){
  request(ani_endpoint+'browse/anime/?type=Tv&status=currently airing&season=spring&airing_data=true&full_page=true&access_token='+ani_token,
  function(error, response, body){
    if(response.statusCode == 401){
      if(attempt == 0){
      	return getNewAniToken(function(){browseAiring(attempt++, callback)});
      }
      else{
      	return 1;
      }
    }

    if(response.statusCode == 200){
    	var names = [];
  		var janimes = JSON.parse(body)
    	callback(janimes);
    }
  })
}

function removeAiring(attempt){

	var animecollection = db.collection('airing');
	animecollection.find().toArray(function(err, animes){
		animes.forEach(function(anime){
			request(ani_endpoint+'anime/'+anime['id']+'?access_token='+ani_token, function(error, response, body){
				if(response.statusCode == 400){
					console.log('error from anime: '+anime['title']);
				}
		    if(response.statusCode == 200){
		    	var retrievedanime = JSON.parse(body);
		    	if(retrievedanime['airing_status'] == 'finished airing' || retrievedanime['airing'] == null){
		    		animecollection.remove({'id':anime['id']});
						console.log(anime['title']);
		    	}
		    }
			});
		});
	});
}

// // set bot's webhook to the heroku app
request.post({
  url: 'https://api.kik.com/v1/config',
  auth: {user : botname, pass : botkey},
  json: bothooksettings
  },
  function (error, response, body) {
    //Check for error
    if(error){
        return console.log('kik bot Error:', error);
    }

    //Check for right status code
    if(response.statusCode !== 200){
        return console.log('kik bot Invalid Status Code Returned:', response.statusCode);
    }
  }
);

mongoClient.connect(murl, function(err, returndb){
  if (err) {
    console.log('unable to connect to mongodb server, Error: ', err);
  } else {
    console.log('established connection to ', murl);
    db = returndb;
  }

// update our database with current anime's

var getanitokenpromise = new promisemodule(function(resolve, reject){
	getNewAniToken(function(){resolve()});
});

getanitokenpromise.done(function(){
	browseAiring(0, function(animes){
	  animes.forEach(function(anime){
	  	if(anime['airing'] != null && anime['airing_status'] == 'currently airing'){
		    var insert_anime = {'title':anime['title_romaji'],
		                        'airing_status':anime['airing_status'],
		                        'airing':anime['airing']}
		    var collection = db.collection('airing');
		    collection.update({'id': anime['id']}, {$set: insert_anime}, {upsert:true}, function(err, result){
		      if(err){
		        console.log('error updating anime');
		      }
		    })
			}
	  })
	});

	removeAiring(0);
});



// Configure the bot API endpoint, details for your bot
let bot = new Bot(botsettings);

bot.updateBotConfiguration();

// var updateairinganimejob = new CronJob('00 * * * * *', function(){
// 	browseAiring(0, function(animes){
// 	  animes.forEach(function(anime){
// 	    var insert_anime = {'title':anime['title_romaji'],
// 	                        'airing_status':anime['airing_status'],
// 	                        'airing':anime['airing']}
// 	    var collection = db.collection('airing');
// 	    collection.update({'id': anime['id']}, {$set: insert_anime}, {upsert:true}, function(err, result){
// 	      if(err){
// 	        console.log('error updating anime');
// 	      }
// 	    });
// 	  })
// 	});
// });

var sendepisodemsgjob = new CronJob(new Date(Date.now + 20000), function(){
	console.log('starting cron job');
	// var airinganimecollection = db.collection('airing');
	// airinganimecollection.find().toArray(function(err, airinganimes){
	// 	for(var i = 0; i < airinganimes.length; i++){
	// 		var anime = airinganimes[i];
	// 		var newepisodejob = new CronJob(new Date(Date.now()+parseInt(anime['airing']['countdown'])*1000), function(){
	// 			console.log('cronjob for '+anime['title']);
	// 			var newepisodemsg = bot.Message.text();
	// 			newepisodemsg.setBody('Episode '+anime['airing']['next_episode']+' of '+anime['title']+' is out. Check your legal streaming sites to watch it now!');
	// 			var subscribers = anime['subscribers'];
	// 			if(subscribers.length > 0){
	// 				for(var j = 0; j < subscribers.length; j++){
	// 					bot.send([newepisodemsg], subscribers[j]);
	// 				}
	// 			}
	// 		}, function(){}, true);
	// 	}
	// });
}, function(){}, true);

var testingcronjob = new CronJob(new Date(Date.now() + 10000), function(){
	console.log('cronjob works');
}, function(){}, true);

bot.onTextMessage((message) => {
	var conversationCollection = db.collection('conversations');
	var userarray;
	console.log('entering promise')
	var findconversationpromise = new promisemodule(function(resolve, reject){
		conversationCollection.find({'name': message.from}).toArray(function(err, userarray){
			console.log('user: ');
			console.log(userarray[0]);
			if(userarray.length == 0){
				conversationCollection.insertOne({'name' : message.from, 'chatId':message.chatId, 'state' : 'default', 'timestamp' : Date.now()});
				conversationCollection.find({'name': message.from}).toArray(function(err, userarray){
					resolve(userarray[0]);
				});
			}
			else{
				resolve(userarray[0]);
			}
		});
	})
	findconversationpromise.done(function foundconversation(user){
		// insert existing user code here
		var text = message.body;
		var stateparts = user['state'].split('-');
		var state = stateparts[0];
		var secondary = parseInt(stateparts[1]) + 1;
		var prevtime = user['timestamp'];
		if((Date.now() - prevtime)/1000 > 60){
			state = 'default'
			conversationCollection.updateOne({'name':message.from},{$set:{'state':'default'}});
		}

		if(state == 'default'){
			if(text == 'view and subscribe to the airing season'){
				var animeCollection = db.collection('airing');
				animeCollection.find().sort({'title': 1}).toArray(function(err, animearray){
					var reply = Bot.Message.text();
					reply.setBody("Please select an anime from this season");
					var keyboardsuggestions = [];
					for (var i = 0; i < 10; i++) {
						keyboardsuggestions.push(animearray[i]['title']);
					}
					keyboardsuggestions.push("next page");
					reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
					bot.send([reply], message.from);
					console.log(message.from);
					conversationCollection.updateOne({'name':message.from},{$set:{'state':'airing-1', 'timestamp':Date.now()}});
				});
			}
			else if(text == 'search anime'){
				// to be implemented
			}
			else{
				var reply = Bot.Message.text();
				reply.setBody("Sorry i didn't get that, please tell me your request");
				var keyboardsuggestions = ["view and subscribe to the airing season"];//, "search anime"];
				reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
				bot.send([reply], message.from);
				conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now()}});
			}
		}
		else if(state == 'airing'){
			if(text == 'next page'){
				var animeCollection = db.collection('airing');
				animeCollection.find().sort({'title': 1}).toArray(function(err, animearray){
					var reply = Bot.Message.text();
					reply.setBody("Please select an anime from this season");
					var keyboardsuggestions = [];
					var page = secondary;
					for (var i = 10*page; i < 10*page + 10; i++) {
						if(i<animearray.length){
							keyboardsuggestions.push(animearray[i]['title']);
						}
					}
					if(page*10+10 < animearray.length){
						keyboardsuggestions.push("next page");
					}
					reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
					bot.send([reply], message.from);
					conversationCollection.updateOne({'name':message.from},{$set:{'state':'airing-'+page, 'timestamp':Date.now()}});
				});
			}
			else{
				var animeCollection = db.collection('airing');
				animeCollection.find({'title': text}).toArray(function(err, animearray){
					if(animearray.length == 0){
						console.log('error finding anime in db');
					}
					var animeID = animearray[0]['id'];
					var reply = Bot.Message.link();
					reply.setUrl("http://anilist.co/anime/"+animeID);
					reply.setTitle(animearray[0]['title']);
					reply.addResponseKeyboard(["subscribe to this", "title"], false, message.from);
					bot.send([reply], message.from);
					conversationCollection.updateOne({'name':message.from},{$set:{'state':'subscribe-'+animearray[0]['title'], 'timestamp':Date.now()}});
				});
			}
		}
		else if(state == 'subscribe'){
			if(text == "subscribe to this anime"){
				// insert code for subscription
				var animetitle = secondary;
				var animeCollection = db.collection('airing');
				animeCollection.find({'title': animetitle}).toArray(function(err, animearray){
					if(animearray.length == 0){
						console.log('error finding anime in db');
					}
					animeCollection.updateOne({'title':animetitle},{$addToSet:{'subscribers':message.from}})
					var reply = Bot.Message.text();
					reply.setBody("Succesfully subscribed! What would you like to do next?");
					var keyboardsuggestions = ["view and subscribe to the airing season", "search anime"]
					reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
					bot.send([reply], message.from);
					conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
				});
			}
			else{
				var reply = Bot.Message.text();
				reply.setBody("Ok then what would you like to do?");
				var keyboardsuggestions = ["view and subscribe to the airing season", "search anime"]
				reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
				bot.send([reply], message.from);
				conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
			}
		}
		else if(state == 'search'){
			// insert code for searching anime
		}
	})
});

// browseAiring(bot, 0);

// Set up your server and start listening
let server = http
    .createServer(bot.incoming())
    .listen(process.env.PORT || 8080);







});