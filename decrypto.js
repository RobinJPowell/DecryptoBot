var Discord = require('discord.io');
var Logger = require('winston');
var Auth = require('./Auth.json');

//Global variables
var GameInProgress = false;

// Configure Logger settings
Logger.remove(Logger.transports.Console);
Logger.add(new Logger.transports.Console, {
    colorize: true
});
Logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
   token: Auth.token,
   autorun: true
});
bot.on('ready', function (evt) {
    Logger.info('Connected');
    Logger.info(bot.username + ' - (' + bot.id + ')');
});
bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');

        switch(args[0]) {
            // commands
            case 'commands':
                bot.sendMessage({
                    to: channelID,
                    message: 'All commands must start with !\
                              \nstart - Starts a new game\
                              \nend - Ends the current game'
                });
                break;
            case 'start':
                if (GameInProgress) { 
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s already a game in progress you big silly'
                    });
                } else {
                    bot.sendMessage({
                        to: channelID,
                        message: 'Starting a new game of Decrypto'
                    });

                    playDecrypto();
                }
                break;
            case 'end':
                if (!GameInProgress) { 
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game to end, type !start to begin one'
                    });
                } else {
                    endGame();

                    bot.sendMessage({
                        to: channelID,
                        message: 'You have killed the game, you monster'
                    });
                }
                break;
         }
     }
});

function playDecrypto() {
    GameInProgress = true;
}

function endGame() {
    GameInProgress = false;
}