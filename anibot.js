'use strict';

var promisemodule = require('promise')

var mongo = require('mongodb');
var mongo_user = process.env.MONGOUSER;
var mongo_pass = process.env.MONGOPASS;
var murl = 'mongodb://'+mongo_user+':'+mongo_pass+'@ds011912.mlab.com:11912/anibotdb';
var mongoClient = mongo.MongoClient;
var db;
mongoClient.connect(murl, function(err, returndb){
  if (err) {
    console.log('unable to connect to mongodb server, Error: ', err);
  } else {
    console.log('established connection to ', murl);
    db = returndb;
  }
});

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

// // set bot's webhook to the heroku app
request.post({
  url: 'https://api.kik.com/v1/config',
  auth: {user : botname, pass : botkey},
  json: bothooksettings
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
  }
);

// update our database with current anime's
browseAiring(0, function(animes){
  animes.forEach(function(anime){
    var insert_anime = {'title':anime['title_romaji'],
                        'airing_status':anime['airing_status'],
                        'airing':anime['airing']}
    var collection = db.collection('airing');
    collection.update({'id': anime['id']}, {$set: insert_anime}, {upsert:true}, function(err, result){
      if(err){
        console.log('error updating anime');
      }
    })
  })
}
)

// Configure the bot API endpoint, details for your bot
let bot = new Bot(botsettings);

bot.updateBotConfiguration();

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
		var page = parseInt(stateparts[1]) + 1;
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
						keyboardsuggestions.push('view-'+animearray[i]['title']);
					}
					keyboardsuggestions.push("next page");
					reply.addResponseKeyboard(keyboardsuggestions, false, message.from);
					bot.send([reply], message.from);
					console.log(message.from);
					conversationCollection.updateOne({'name':message.from},{$set:{'state':'airing-1', 'timestamp':Date.now()}});
				});
			}
			else if(text == 'search anime'){
			}
			else{
				var reply = Bot.Message.text();
				reply.setBody("Sorry i didn't get that, please tell me your request");
				var keyboardsuggestions = ["view and subscribe to the airing season", "search anime"]
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
					for (var i = 10*page; i < 10*page + 10; i++) {
						if(i<animearray.length){
							keyboardsuggestions.push('view-'+animearray[i]['title']);
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
			else if(text.split('-')[0] == 'view'){
				var animetitle = text.split('-')[1];
				var animeCollection = db.collection('airing');
				animeCollection.find({'title': animetitle}).toArray(function(err, animearray){
					animeID = animearray[0]['id'];
					var reply = Bot.Message.link();
					reply.setUrl("http://anilist.co/anime/"+animeID);
					reply.setTitle(animearray[0]['title']);
					reply.addResponseKeyboard(["subscribe-"+animearray[0]['title']], false, message.from);
					bot.send([reply], message.from);
					conversationCollection.updateOne({'name':message.from},{$set:{'state':'default', 'timestamp':Date.now()}});
				});
			}
		}
	})
});

// browseAiring(bot, 0);

// Set up your server and start listening
let server = http
    .createServer(bot.incoming())
    .listen(process.env.PORT || 8080);