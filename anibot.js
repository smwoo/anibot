'use strict';

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
	console.log('getting new token');
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
	console.log('starting browsing');
  request(ani_endpoint+'browse/anime/?type=Tv&status=currently airing&season=spring&airing_data=true&full_page=true&access_token='+ani_token,
  function(error, response, body){
  	console.log('browsing callback');
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
    	// for(var i=0; i<janimes.length; i++){
    	// 	var janime = janimes[i];
    	// 	names.push(janime['title_romaji']);
	    // 	// console.log(names[i]);
    	// }
    	console.log('returning');
    	// return names;
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

    //All is good. Print the body
    console.log('success');
    // console.log(body); // Show the HTML for the Modulus homepage.
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
	var userCollection = db.collection('conversations');

	userCollection.find({'name': message.from}).toarray(function(err, userCollection, message){
		if(users.length == 0){
			userCollection.insertOne({'name' : message.from, 'chatId':message.chatId, 'state' : 'default', 'timestamp' : Date.now()});
			var text = message.body;
			if(text == 'airing'){

			}
			else if(text == 'search'){

			}
			else{
				var reply = message.text();
				reply.body = "Sorry i didn't get that, please tell me your request";
				var keyboard = [{'to': message.from,
												 'type': 'suggested',
												 'responses':[{"type":"text",
												 							 "body":"view and subscribe to the airing season"},
												 							{"type":"text",
												 							 "body":"search anime"}]
												}]
				bot.send([reply], message.from, message.chatId);
			}
		}
	})

	var text = message.body;
	if(text === 'airing'){
		console.log('in reply');
		browseAiring(0, function(names){
			var reply='';
			for(var i = 0; i < names.length; i++){
				reply+=names[i]+'\n\n'
			}
			console.log('sending message');
			message.reply(reply);
		});
	}

});

// browseAiring(bot, 0);

// Set up your server and start listening
let server = http
    .createServer(bot.incoming())
    .listen(process.env.PORT || 8080);