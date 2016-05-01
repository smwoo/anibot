'use strict';

var mongo = require('mongodb');
var mongo_user = process.env.MONGOUSER;
var mongo_pass = process.env.MONGOPASS;
var murl = 'mongodb://'+mongo_user+':'+mongo_pass+'@ds011912.mlab.com:11912/anibotdb';

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

function browseAiring(bot, attempt, callback){
	console.log('starting browsing');
  request(ani_endpoint+'browse/anime/?type=Tv&status=currently airing&season=spring&full_page=true&access_token='+ani_token,
  function(error, response, body){
  	console.log('browsing callback');
    if(response.statusCode == 401){
      if(attempt == 0){
      	return getNewAniToken(function(){browseAiring(bot, attempt++, callback)});
      }
      else{
      	return 1;
      }
    }

    if(response.statusCode == 200){
    	var names = [];
  		var janimes = JSON.parse(body)
    	for(var i=0; i<janimes.length; i++){
    		var janime = janimes[i];
    		names.push(janime['title_romaji']);
	    	// console.log(names[i]);
    	}
    	console.log('returning');
    	// return names;
    	callback(names);
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

// Configure the bot API endpoint, details for your bot
let bot = new Bot(botsettings);

bot.updateBotConfiguration();

bot.onTextMessage((message) => {
	var text = message.body;
	if(text === 'airing'){
		console.log('in reply');
		browseAiring(bot, 0, function(names){
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