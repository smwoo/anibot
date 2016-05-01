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

module.exports = {
  browseAiring: function(bot, attempt, callback){
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
}