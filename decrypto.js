var Discord = require('discord.io');
var Logger = require('winston');
var PackageInfo = require('./package.json');
var Auth = require('./auth.json');

//Global variables
var GameInProgress = false;
var SelectingTeams = false;

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
    if (message.substring(0, 3) == '!dc') {
        var args = message.substring(4).split(' ');

        Logger.debug('Command ' + args + ' from ' + user)

        switch(args[0]) {
            // commands
            case 'commands':
                bot.sendMessage({
                    to: channelID,
                    message: 'COMMANDS:\
                              \n!dc start - Starts a new game\
                              \n!dc end - Ends the current game\
                              \n!dc rules - Displays the rules\
                              \n!dc join purple/green - Joins the purple or green team'
                });
                break;
            case 'start':
                if (GameInProgress) { 
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s already a game in progress you big silly'
                    });
                } else {
                    GameInProgress = true;
                    SelectingTeams = true;

                    bot.sendMessage({
                        to: channelID,
                        message: 'Starting a new game of Decrypto\
                                  \nJoin a team, using the commands \'!dc join purple\' or \'!dc join green\''
                    });
                }
                break;
            case 'end':
                if (!GameInProgress) { 
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game to end, type !dc start to begin one'
                    });
                } else {
                    endGame();

                    bot.sendMessage({
                        to: channelID,
                        message: 'You have killed the game, you monster'
                    });
                }
                break;
            case 'rules':
                bot.sendMessage({
                    to: channelID,
                    message: 'I haven\'t written any rules yet'
                });
                break;
            case 'join':
                bot.sendMessage({
                    to: channelID,
                    message: 'You can\'t join a team yet, I haven\'t finished writing this bit'
                });
                break;
            default:
                bot.sendMessage({
                    to: channelID,
                    message: 'Decrypto bot version ' + PackageInfo.version + ' by ' + PackageInfo.author + '\
                              \nTo see how to play, type \'!dc rules\'\
                              \nTo start a new game, type \'!dc start\'\
                              \nTo see a full list of commands, type \'!dc commands\'\
                              \nIf you find any bugs, or have ideas for improvements, please visit ' + PackageInfo.bugs.url + ' to log them'
                });
                break;
         }
     }
});

function endGame() {
    GameInProgress = false;
}