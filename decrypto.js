//Global Variables
var Discord = require('discord.io');
var Logger = require('winston');
var Fs = require("fs");
var PackageInfo = require('./package.json');
var Auth = require('./auth.json');
var AllGames = [];

// Read the clue words from the file
var Keywords = Fs.readFileSync("./keywords.txt").toString();
var KeywordList = Keywords.split(",");

// Read the solutions from the file
var Codes = Fs.readFileSync("./codes.txt").toString();
var CodeList = Codes.split(",");

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
        var gameProperties = AllGames.find(element => element.channelID == channelID)

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
                              \n!dc help - Displays the help screen\
                              \n!dc rules - Displays the rules\
                              \n!dc start - Starts a new game\
                              \n!dc end - Ends the current game\
                              \n!dc join black/white - Joins the black or white team\
                              \n!dc ready - Indicates that team selection is complete, and you wish to begin the game\
                              \n!dc clues clue1, clue2, clue3 - Submit your clues when you are the Encryptor'
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
                                  \nJoin a team, using the commands \'!dc join black\' or \'!dc join white\'\
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
                    if (args[1] == 'black' || args[1] == 'white') {                   
                        addPlayerToTeam(userID, user, args[1], gameProperties);
                    } else {
                        bot.sendMessage({
                            to: channelID,
                            message: args[1] + ' is not a valid team'
                        });
                    }
                }
                break;
            // Team selection done, start the game proper
            case 'ready':
                if (!gameProperties.gameInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game currently in progress, type \'!dc start\' to begin one'
                    });
                } else if (!gameProperties.selectingTeams) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s already a game in progress you big silly'
                    });
                } else {
                    gameProperties.selectingTeams = false;

                    // Short pause between executions helps lessen the info dump that happens here
                    sendKeywordsToTeams(gameProperties);
                    setTimeout(() => { sendCodeToNextEncryptor(gameProperties); }, 1000);                      
                }
                break;
            // Clues submitted by the team Encryptor
            case 'clues':
                if (!gameProperties.gameInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game currently in progress, type \'!dc start\' to begin one'
                    });
                } else if (gameProperties.selectingTeams) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'Team selection is still in progress, chill out with your clues'
                    });
                } else if (gameProperties.currentEncryptor.userID != userID) {
                    bot.sendMessage({
                        to: channelID,
                        message: gameProperties.currentEncryptor.user + ' is the current Encryptor, I will not be accepting clues from anyone else'
                    });
                } else if (gameProperties.currentClues.length == 3) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'You\'ve already submitted your clues, too late to change your mind now'
                    });
                } else {
                    validateAndRecordClues(args, gameProperties);
                }
                break;
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

// Adds a player to their chosen team, removing them from the other team first
// in order to allow switching during selection
function addPlayerToTeam(userID, user, team, gameProperties) {
    var player = new Player(userID, user);
    
    if (team == 'black') {
        var playerIndex = gameProperties.blackTeamMembers.findIndex(element => element.userID == player.userID);

        if (playerIndex == -1) {
            playerIndex = gameProperties.whiteTeamMembers.findIndex(element => element.userID == player.userID);
    
            if (playerIndex > -1) {
                gameProperties.whiteTeamMembers.splice(playerIndex, 1);
            }

            gameProperties.blackTeamMembers.push(player);
        } else {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: user + ' is already on the ' + team + ' team'
            });
            return;
        }
    } else {
        var playerIndex = gameProperties.whiteTeamMembers.findIndex(element => element.userID == player.userID);

        if (playerIndex == -1) {
            playerIndex = gameProperties.blackTeamMembers.findIndex(element => element.userID == player.userID);
    
            if (playerIndex > -1) {
                gameProperties.blackTeamMembers.splice(playerIndex, 1);
            }

            gameProperties.whiteTeamMembers.push(player);
        } else {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: user + ' is already on the ' + team + ' team'
            });
            return;
        }
    }

    Logger.debug('Adding player ' + userID + ' to team ' + team + ' in channel ' + gameProperties.channelID);

    var blackTeamMembers = [];
    var whiteTeamMembers = [];

    gameProperties.blackTeamMembers.forEach(element => blackTeamMembers.push(element.user));
    gameProperties.whiteTeamMembers.forEach(element => whiteTeamMembers.push(element.user));

    bot.sendMessage({
        to: gameProperties.channelID,
        message: user + ' has joined the ' + team + ' team\
                 \nBlack Team - ' + blackTeamMembers + '\
                 \nWhite Team - ' + whiteTeamMembers
    });
}

// Randomly selects 4 keywords for each team and sends them to team members
function sendKeywordsToTeams (gameProperties) {    
    var keywordsToUse = [];
    while(keywordsToUse.length < 8) {
        var keyword = KeywordList[Math.floor(Math.random()*KeywordList.length)];
        if (keywordsToUse.indexOf(keyword) == -1) {
            keywordsToUse.push(keyword);
        }
    }

    gameProperties.blackTeamMembers.forEach(element => {
        bot.sendMessage({
            to: element.userID,
            message: 'Your team\'s keywords are:\
                      \n1 - ' + keywordsToUse[0] + '\
                      \n2 - ' + keywordsToUse[1] + '\
                      \n3 - ' + keywordsToUse[2] + '\
                      \n4 - ' + keywordsToUse[3]
        });
    })

    gameProperties.whiteTeamMembers.forEach(element => {
        bot.sendMessage({
            to: element.userID,
            message: 'Your team\'s keywords are:\
                      \n1 - ' + keywordsToUse[4] + '\
                      \n2 - ' + keywordsToUse[5] + '\
                      \n3 - ' + keywordsToUse[6] + '\
                      \n4 - ' + keywordsToUse[7]
        });
    })

    bot.sendMessage({
        to: gameProperties.channelID,
        message: 'Your team\'s keywords have been messaged to you, good luck\
                  \n---------------------------------------------------------------------------'
    });
}

// Randomly select a code and send it to the next encryptor
function sendCodeToNextEncryptor (gameProperties) {
    gameProperties.currentCode = CodeList[Math.floor(Math.random()*CodeList.length)];
    gameProperties.currentTeam = gameProperties.nextTurn;
    
    if (gameProperties.currentTeam == 'black') {
        gameProperties.currentEncryptor = gameProperties.blackTeamMembers[gameProperties.nextBlackEncryptor];

        gameProperties.nextTurn = 'white';
        gameProperties.nextBlackEncryptor += 1;

        if (gameProperties.nextBlackEncryptor == gameProperties.blackTeamMembers.length) {
            gameProperties.nextBlackEncryptor = 0;
        }
    } else {
        gameProperties.currentEncryptor = gameProperties.whiteTeamMembers[gameProperties.nextWhiteEncryptor];

        gameProperties.nextTurn = 'black';
        gameProperties.nextWhiteEncryptor += 1;

        if (gameProperties.nextWhiteEncryptor == gameProperties.whiteTeamMembers.length) {
            gameProperties.nextWhiteEncryptor = 0;
        }
    }

    bot.sendMessage({
        to: gameProperties.currentEncryptor.userID,
        message: 'Your code is ' + gameProperties.currentCode
    });
    bot.sendMessage({
        to: gameProperties.channelID,
        message: 'It is the ' + gameProperties.currentTeam + ' team\'s turn\
                 \n' + gameProperties.currentEncryptor.user + ' is their Encryptor this round, and has been sent a code\
                 \nWhen you are ready ' + gameProperties.currentEncryptor.user + ', submit your clues using \'!dc clues clue1, clue2, clue3\'\
                 \nDon\'t forget the commas, I won\'t understand you otherwise'
    });
}

// Validate that 3 clues have been submitted and record them
function validateAndRecordClues(args, gameProperties) {    
    var cluesList = "";
    
    // args is split by ' ', need to recombine and split by ', ' to get the clues
    // args[0] will always have been the keyword 'clues', so start at 1
    for (var i = 1; i < args.length; i++) {
        cluesList = cluesList + " " + args[i];
    }

    gameProperties.currentClues = cluesList.split(',');

    if (gameProperties.currentClues.length == 3) {
        bot.sendMessage({
            to: gameProperties.channelID,
            message: 'The clues for this round are:\
                      \n' + gameProperties.currentClues[0] + '\
                      \n' + gameProperties.currentClues[1] + '\
                      \n' + gameProperties.currentClues[2]
        });
    } else {
        gameProperties.currentClues = [];

        bot.sendMessage({
            to: gameProperties.channelID,
            message: 'You have to submit 3 clues, you have submitted ' + gameProperties.currentClues.length
        });
    }
}

// Ends the game by resetting its properties
function endGame(gameProperties) {
    Logger.debug('Ending game in channel ' + gameProperties.channelID);

    gameProperties.gameInProgress = false;
    gameProperties.selectingTeams = false;
    gameProperties.blackTeamMembers = [];
    gameProperties.nextBlackEncryptor = 0;
    gameProperties.whiteTeamMembers = [];
    gameProperties.nextWhiteEncryptor = 0
    gameProperties.nextTurn = 'white';
    gameProperties.currentCode = 0;
    gameProperties.currentTeam = ""
    gameProperties.currentEncryptor = null;
    gameProperties.currentClues = []
}

// Each game in progress is stored in an instance of GameProperties
function GameProperties (channelID, now) {
    this.channelID = channelID;
    this.gameInProgress = false;
    this.selectingTeams = false;
    this.blackTeamMembers = [];
    this.nextBlackEncryptor = 0
    this.whiteTeamMembers = [];
    this.nextWhiteEncryptor = 0
    this.lastGameStartTime = now;
    this.nextTurn = 'white';
    this.currentCode = 0;
    this.currentTeam = "";
    this.currentEncryptor = null;
    this.currentClues = [];
}

// Each player in a team is stored in an instance of Player
function Player (userID, user) {
    this.userID = userID;
    this.user = user;
}