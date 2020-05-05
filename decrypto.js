var Discord = require('discord.io');
var Logger = require('winston');
var PackageInfo = require('./package.json');
var Auth = require('./auth.json');

//Global Variables
var AllGames = [];

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
    // Bot listens for messages that start with `!dc`
    if (message.substring(0, 3) == '!dc') {
        var args = message.substring(4).split(' ');

        Logger.debug('Command ' + args + ' from ' + userID + ' in channel ' + channelID)

        // Find the game being run in the channel sending the command
        var gameProperties = AllGames.find(x => x.channelID == channelID)

        // If this channel doesn't have a game set up yet, create one
        if (gameProperties == null) {
            Logger.debug('New GameProperties created for channel ' + channelID);            
            gameProperties = new GameProperties(channelID, Date.now());
            AllGames.push(gameProperties);
        }

        switch(args[0]) {
            // List all possible commands
            case 'help':
                bot.sendMessage({
                    to: channelID,
                    message: 'Decrypto bot version ' + PackageInfo.version + ' by ' + PackageInfo.author + '\
                              \nTo see how to play, type \'!dc rules\'\
                              \nTo start a new game, type \'!dc start\'\
                              \nTo see a full list of commands, type \'!dc commands\'\
                              \nIf you find any bugs, or have ideas for improvements, please visit ' + PackageInfo.bugs.url + ' to log them'
                });
                break;
            case 'commands':
                bot.sendMessage({
                    to: channelID,
                    message: 'COMMANDS:\
                              \n!dc start - Starts a new game\
                              \n!dc end - Ends the current game\
                              \n!dc rules - Displays the rules\
                              \n!dc join purple/green - Joins the purple or green team\
                              \n!dc ready - Indicates that team selection is complete, and you wish to begin the game'
                });
                break;
            case 'rules':
                bot.sendMessage({
                    to: channelID,
                    message: 'I haven\'t written any rules yet'
                });
                break;
            // Starts the game, beginning with team selection
            case 'start':
                if (gameProperties.gameInProgress) { 
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s already a game in progress you big silly'
                    });
                } else {
                    gameProperties.gameInProgress = true;
                    gameProperties.lastGameStartTime = Date.now();
                    gameProperties.selectingTeams = true;

                    bot.sendMessage({
                        to: channelID,
                        message: 'Starting a new game of Decrypto\
                                  \nJoin a team, using the commands \'!dc join purple\' or \'!dc join green\'\
                                  \nWhen team selection is complete, type \'!dc ready\' to begin'
                    });
                }
                break;                       
            // Adds a player to their selected team
            case 'join':
                if (!gameProperties.gameInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game currently in progress, type \'!dc start\' to begin one'
                    });
                } else if (!gameProperties.selectingTeams) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'Team selection is not currently in progress'
                    });
                } else {
                    if (args[1] == 'purple' || args[1] == 'green') {                   
                        addPlayerToTeam(userID, user, args[1], gameProperties);
                    } else {
                        bot.sendMessage({
                            to: channelID,
                            message: args[1] + ' is not a valid team'
                        });
                    }
                }
                break;
            case 'ready':
                bot.sendMessage({
                    to: channelID,
                    message: 'I appriciate your enthusiasm, but there is no game here yet'
                });
            // Ends an in progress game
            case 'end':
                if (!gameProperties.gameInProgress) { 
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game to end, type \'!dc start\' to begin one'
                    });
                } else {
                    endGame(gameProperties);

                    bot.sendMessage({
                        to: channelID,
                        message: 'You have killed the game, you monster'
                    });
                }
                break; 
            default:
                bot.sendMessage({
                    to: channelID,
                    message: 'That is not a valid command, type \'!dc commands\' to get a list'
                });
         }
     }
});

//Ends the game by resetting its properties
function endGame(gameProperties) {
    Logger.debug('Ending game in channel ' + gameProperties.channelID);

    gameProperties.gameInProgress = false;
    gameProperties.selectingTeams = false;
    gameProperties.purpleTeamMembers = [];
    gameProperties.greenTeamMembers = [];
}

// Adds a player to their chosen team, removing them from the other team first
// in order to allow switching during selection
function addPlayerToTeam(userID, user, team, gameProperties) {
    var player = new Player(userID, user);
    
    if (team == 'purple') {
        var playerIndex = gameProperties.purpleTeamMembers.findIndex(x => x.userID == player.userID);

        if (playerIndex == -1) {
            playerIndex = gameProperties.greenTeamMembers.findIndex(x => x.userID == player.userID);
    
            if (playerIndex > -1) {
                gameProperties.greenTeamMembers.splice(playerIndex, 1);
            }

            gameProperties.purpleTeamMembers.push(player);
        } else {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: user + ' is already on the ' + team + ' team'
            });
            return;
        }
    } else {
        var playerIndex = gameProperties.greenTeamMembers.findIndex(x => x.userID == player.userID);

        if (playerIndex == -1) {
            playerIndex = gameProperties.purpleTeamMembers.findIndex(x => x.userID == player.userID);
    
            if (playerIndex > -1) {
                gameProperties.purpleTeamMembers.splice(playerIndex, 1);
            }

            gameProperties.greenTeamMembers.push(player);
        } else {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: user + ' is already on the ' + team + ' team'
            });
            return;
        }
    }

    Logger.debug('Adding player ' + userID + ' to team ' + team + ' in channel ' + gameProperties.channelID);

    var purpleTeamMembers = [];
    var greenTeamMembers = [];

    gameProperties.purpleTeamMembers.forEach(element => purpleTeamMembers.push(element.user));
    gameProperties.greenTeamMembers.forEach(element => greenTeamMembers.push(element.user));

    bot.sendMessage({
        to: gameProperties.channelID,
        message: user + ' has joined the ' + team + ' team\
                 \nPurple Team - ' + purpleTeamMembers + '\
                 \nGreen Team - ' + greenTeamMembers
    });
}

// Each game in progress is stored in an instance of GameProperties
function GameProperties (channelID, now) {
    this.channelID = channelID;
    this.gameInProgress = false;
    this.selectingTeams = false;
    this.purpleTeamMembers = [];
    this.greenTeamMembers = [];
    this.lastGameStartTime = now;
};

// Each player in a team is stored in an instance of Player
function Player (userID, user) {
    this.userID = userID;
    this.user = user;
}