'use strict';

var promisemodule = require('promise')

var sizeof =require('object-sizeof');

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

function isEmpty(object) {
  for(var key in object) {
    if(object.hasOwnProperty(key)){
      return false;
    }
  }
  return true;
}

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

function updateAiring(){
	var month = Date.prototype.getMonth();
	var season = 'winter';
  var prevseason = "winter"; // check previous seasons for 2-cour animes. To my knowledge split cours are seperete seasons
  var nextseason = 'invalid';
	if(month >= 0 && month <3){
		season = 'winter';
		prevseason = "fall";
	}
	else if(month >= 3 && month <6){
		season = 'spring';
		prevseason = "winter";
	}
	else if(month >= 6 && month <9){
		season = 'summer';
		prevseason = "spring";
	}
	else if(month >= 9 && month <12){
		season = 'fall';
		prevseason = "summer";
	}

	// check end of season months for overlaping seasons
	if(month == 2){
		nextseason = "spring";
	}
	else if(month == 5){
		nextseason = "summer";
	}
	else if(month == 8){
		nextseason = "fall";
	}
	else if(month == 11){
		nextseason = "winter";
	}

	var animearray = [];

  request(ani_endpoint+'browse/anime/?type=Tv&status=currently airing&season='+season+'&airing_data=true&full_page=true&access_token='+ani_token, function(error, response, body){
    if(response.statusCode == 401){
    	console.log("error getting animes");
    }
    else if(response.statusCode == 200){
  		var animes = JSON.parse(body);
  		animearray.push.apply(animearray, animes);
    }
  });

  request(ani_endpoint+'browse/anime/?type=Tv&status=currently airing&season='+prevseason+'&airing_data=true&full_page=true&access_token='+ani_token, function(error, response, body){
    if(response.statusCode == 401){
    	console.log("error getting animes");
    }
    else if(response.statusCode == 200){
  		var animes = JSON.parse(body);
  		animearray.push.apply(animearray, animes);
    }
  });

  if(nextseason != 'invalid'){
	  request(ani_endpoint+'browse/anime/?type=Tv&status=currently airing&season='+nextseason+'&airing_data=true&full_page=true&access_token='+ani_token, function(error, response, body){
	    if(response.statusCode == 401){
	    	console.log("error getting animes");
	    }
	    else if(response.statusCode == 200){
	  		var animes = JSON.parse(body);
	  		animearray.push.apply(animearray, animes);
	    }
	  });
	}

  var airinganimecollection = db.collection('airing');
	animearray.forEach(function(anime){
  	if(anime['airing'] !== null && anime['airing_status'] == 'currently airing'){
  		var dbanime = airinganimecollection.findOne({'id':anime['id']});
  		var subscribers;
  		if(dbanime){
  			subscribers = dbanime['subscribers'];
	  		if (typeof subscribers == 'undefined'){
	  			subscribers = [];
	  		}
	  	}
	  	else{
  			subscribers = [];
	  	}
	    var insert_anime = {'title':anime['title_romaji'],
	                        'airing_status':anime['airing_status'],
	                        'airing':anime['airing'],
	                        'subscribers': subscribers,
	                        'last_update': Date.now()/1000};
	    var collection = db.collection('airing');
	    collection.update({'id': anime['id']}, {$set: insert_anime}, {upsert:true}, function(err, result){
	      if(err){
	        console.log('error updating anime');
	      }
	    })
		}
  });
}

function removeAiring(){
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

function returntomainmenu(bot, message){
	var reply = Bot.Message.text();
	reply.setBody("Here are the main menu selections");
	var keyboardsuggestions = ["view and subscribe to the airing season", "search anime"];
	reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
	bot.send([reply], message.from);
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

// wrape everything in connect callback so there is no null db
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
	updateAiring();
	removeAiring();
});



// Configure the bot API endpoint, details for your bot
let bot = new Bot(botsettings);
bot.updateBotConfiguration();

// get the latest anime updates
try {
	var updateAiringAnimesJob = new CronJob('0 0 1/1 * * *', function(){
		console.log("updating anime");
		var airinganimecollection = db.collection.find('airing');
		airinganimecollection.find().forEach(function(err, anime){
			var animetitle = anime['title'];
			request(ani_endpoint+'anime/search/'+animetitle+'?access_token='+ani_token, function(error, response, body){
				if(response.statusCode == 400){
					console.log('error from anime: '+anime['title']);
				}
				if(response.statusCode == 200){
					var searchresults = JSON.parse(body);
					var janime = searchresults[0];
					if(janime['airing_status'] == "finished airing"){
						airinganimecollection.remove({'title':janime['title']});
					}
					else if(janime['airing_status'] == "currently airing"){
						var insert_anime = {'airing_status':janime['airing_status'], 'airing':janime['airing']};
						airinganimecollection.update({'title':janime['title_romaji']}, {$set:insert_anime});
					}
				}
			});
		});

		updateAiring();
		removeAiring();

	}, true, 'America/Toronto');
} catch(ex) {
    console.log("updating anime cron job failed");
}

try{
	var sendmsgtosubscribersjob = new CronJob('0 0 9 1/1 * * *', function(){
		var airinganimecollection = db.collection.find('airing');
		var todaysAnime = [];

		airinganimecollection.find().forEach(function(err, anime){
			var countdown = parseInt(anime['airing']['countdown']);
			var last_update = parseInt(anime['last_update']);
			var current = Date.now()/1000;
			var secondsinaDay = 86399;
			if(countdown - current + last_update > secondsinaDay){
				todaysAnime.push(anime);
			}
		});

		todaysAnime.forEach(function(err, anime){
			var subscribers = anime['subscribers'];
			var newepisodemsg = Bot.Message.text();
			newepisodemsg.setBody('Episode '+anime['airing']['next_episode']+' of '+anime['title']+' airs today.');
			subscribers.forEach(function(err, subscriber){
				bot.send([newepisodemsg], subscriber);
			});
		});
	}, true, 'America/Toronto');
} catch(ex) {
	console.log("sending episode reminder cron job failed");
}

try{
	var getNewAniTokenJob = new CronJob('0 0/59 * 1/1 * * *', function(){
		getNewAniToken();
	}, true);
} catch(ex){
	console.log("refreshing ani token cron job failure");
}

/*
// to do change subscribed episode message system
var sendepisodemsgjob = new CronJob('0 0 0 * * 1', function(){
	console.log('starting cron job');
	var airinganimecollection = db.collection('airing');
	airinganimecollection.find().toArray(function(err, airinganimes){
		for(var i = 0; i < airinganimes.length; i++){
			var anime = airinganimes[i];
			var newepisodejob = new CronJob(new Date(Date.now()+parseInt(anime['airing']['countdown'])*1000), function(){
				console.log('cronjob executing');
				var newepisodemsg = Bot.Message.text();
				newepisodemsg.setBody('Episode '+anime['airing']['next_episode']+' of '+anime['title']+' is out. Check your legal streaming sites to watch it now!');
				var subscribers = anime['subscribers'];
				if(subscribers.length > 0){
					for(var j = 0; j < subscribers.length; j++){
						bot.send([newepisodemsg], subscribers[j]);
					}
				}
			}, function(){}, true);
		}
	});
}, function(){}, true);
*/

bot.onStartChattingMessage((message) => {
  bot.getUserProfile(message.from)
    .then((user) => {
			var conversationCollection = db.collection('conversations');
			conversationCollection.updateOne({'name' : message.from}, {$set: {'chatId':message.chatId, 'state' : 'default', 'timestamp' : Date.now()}}, {upsert:true}, function(err, result){
				reply = Bot.Message.text();
				reply.setBody('Hey '+user.firstName+' I\'m anibot, an anime chat bot used to search for anime or to subscribe and receive messages when a new episode of an anime comes out. To begin please choose one of the options below.');
				var keyboardsuggestions = ["view and subscribe to the airing season", "search anime"];
				reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
				bot.send([reply], message.from);
			});
    });
});

bot.onTextMessage((message) => {
	var conversationCollection = db.collection('conversations');
	var userarray;
	var findconversationpromise = new promisemodule(function(resolve, reject){
		conversationCollection.findOne({'name': message.from}, function(err, user){
			console.log('user: ');
			console.log(user);
			if(user){
				resolve(user);
			}
			else{
				conversationCollection.insertOne({'name' : message.from, 'chatId':message.chatId, 'state' : 'default', 'timestamp' : Date.now()});
				conversationCollection.findOne({'name': message.from}, function(err, user){
					resolve(user);
				});
			}
		});
	})
	findconversationpromise.done(function foundconversation(user){
		var text = message.body;
		var stateparts = user['state'].split('-');
		var state = stateparts[0];
		var secondary = parseInt(stateparts[1]);
		var prevtime = user['timestamp'];

		// timeout to default screen. not that useful so commented out for now. still keeping timestamps for potential future use
		/*
		if((Date.now() - prevtime)/1000 > 60){
			state = 'default'
			conversationCollection.updateOne({'name':message.from},{$set:{'state':'default'}});
		}
		*/

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
				var reply = Bot.Message.text();
				reply.setBody("enter your search term");
				bot.send([reply], message.from);
				conversationCollection.updateOne({'name':message.from},{$set:{'state':'search', 'timestamp':Date.now()}});
			}
			else{
				var reply = Bot.Message.text();
				reply.setBody("Sorry i didn't get that, please use the prompts to tell me your request");
				var keyboardsuggestions = ["view and subscribe to the airing season", "search anime"];
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
					var keyboardsuggestions = ["prev page"];
					var page = secondary++;
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

			else if(text == 'prev page'){
				var animeCollection = db.collection('airing');
				animeCollection.find().sort({'title': 1}).toArray(function(err, animearray){
					var reply = Bot.Message.text();
					reply.setBody("Please select an anime from this season");
					var keyboardsuggestions = ["prev page"];
					var page = secondary--;
					for (var i = 10*page; i < 10*page + 10; i++) {
						if(i<animearray.length){
							keyboardsuggestions.push(animearray[i]['title']);
						}
					}
					if(page*10+10 < animearray.length){
						keyboardsuggestions.push.apply(keyboardsuggestions, ["next page", "main menu"]);
					}
					reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
					bot.send([reply], message.from);
					conversationCollection.updateOne({'name':message.from},{$set:{'state':'airing-'+page, 'timestamp':Date.now()}});
				});
			}

			else if(text == "main menu"){
				returntomainmenu(bot, message);
				conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
			}

			else{
				var animeCollection = db.collection('airing');
				animeCollection.findOne({'title': text}, function(err, anime){
					if(anime){
						var animeID = anime['id'];
						var reply = Bot.Message.link();
						reply.setUrl("http://anilist.co/anime/"+animeID);
						reply.setTitle(anime['title']);
						reply.addResponseKeyboard(["subscribe to this anime", "main menu"], false, message.from);
						bot.send([reply], message.from);
						conversationCollection.updateOne({'name':message.from},{$set:{'state':'subscribe-'+animeID, 'timestamp':Date.now()}});
					}

					else{
						var errormsg = Bot.Message.text();
						errormsg.setBody("Sorry but the anime "+text+" doesn't appear to be airing. Did you make sure to use the prompts?");
						bot.send([errormsg], message.from);
						returntomainmenu(bot, message);
						conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
					}
				});
			}
		}
		else if(state == 'subscribe'){
			if(text == "subscribe to this anime"){
				// insert code for subscription
				var animeID = secondary;
				var animeCollection = db.collection('airing');
				animeCollection.findOne({'id': animeID}, function(err, anime){
					if(anime){
						var reply = Bot.Message.text();
						reply.setBody("Succesfully subscribed! What would you like to do next?");
						var keyboardsuggestions = ["view and subscribe to the airing season", "search anime"]
						reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
						bot.send([reply], message.from);
						conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
					}
					else{
						console.log('error finding anime in db id number: '+animeID);
					}
					animeCollection.updateOne({'id':animeID},{$addToSet:{'subscribers':message.from}});

				});
			}
			else if(text == "main menu"){
				returntomainmenu(bot, message);
				conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
			}
			else{
				var errormsg = Bot.Message.text();
				errormsg.setBody("Sorry but please use the keyboard prompts. Returning to main menu");
				bot.send([errormsg], message.from);
				returntomainmenu(bot, message);
				conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
			}
		}
		else if(state == 'search'){
			request(ani_endpoint+'anime/search/'+text+'?access_token='+ani_token, function(error, response, body){
				if(response.statusCode == 200 && sizeof(body) !== 2){
					console.log("error "+sizeof(body));
					var searchresults = JSON.parse(body);
					if(searchresults.length == 1){
						var anime = searchresults[0];
						var reply = Bot.Message.link();
						reply.setUrl("http://anilist.co/anime/"+anime['id']);
						reply.setTitle(anime['title_romaji']);
						bot.send([reply], message.from);
						returntomainmenu(bot, message);
						conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
					}
					else{
						var keyboardsuggestions = [];
						for(var i = 0; i < searchresults.length; i++){
							if(i < 20){
								keyboardsuggestions.push(searchresults[i]['title_romaji']);
							}
						}
						console.log(keyboardsuggestions);
						var reply = Bot.Message.text();
						reply.setBody("choose an anime from the results");
						reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
						bot.send([reply], message.from);
						conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'view'}});
					}
				}
				else{
					var reply = Bot.Message.text();
					reply.setBody("No results found. Returning to main menu.");
					bot.send([reply], message.from);
					returntomainmenu(bot, message);
					conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
				}
			});
		}
		else if (state == 'view'){
			request(ani_endpoint+'anime/search/'+text+'?access_token='+ani_token, function(error, response, body){
				if(response.statusCode == 200){
					var searchresults = JSON.parse(body);
					var anime = searchresults[0];
					var reply = Bot.Message.link();
					reply.setUrl("http://anilist.co/anime/"+anime['id']);
					reply.setTitle(anime['title_romaji']);
					bot.send([reply], message.from);
					returntomainmenu(bot, message);
					conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
				}
				else{
					var reply = Bot.Message.text();
					reply.setBody("Error accessing anime. Returning to main menu.");
					bot.send([reply], message.from);
					returntomainmenu(bot, message);
					conversationCollection.updateOne({'name':message.from},{$set:{'timestamp':Date.now(), 'state':'default'}});
				}
			});
		}
	})
});

// updateAiring(bot, 0);

// Set up your server and start listening
let server = http
    .createServer(bot.incoming())
    .listen(process.env.PORT || 8080);







}); // mongo connect callback close bracket