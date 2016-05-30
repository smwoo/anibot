# anibot
## A kik chat bot to subscribe to alerts on new episodes of anime and view existing anime

This bot uses the anilist.co api to get information on the currently airing animes of the season and also to allow users to search the site for information on different shows.

Users can view the current season and choose to subscribe to a series in order to be notified of when a new episode airs.

#Future plans

Currently rough implementation has been completed, further work in error catching and user flow needs to be improved

The current subscription model doesn't seem to be very feasible. Currently the second that an episode airs in Japan, users will be notified. This has flaws as streaming options for users outside of Japan will not exist until several hours after the airing period. Current plan is to switch to a scheduled morning message that will notify the users of the episodes that will air today and remind them to check for streaming options later in the evening.