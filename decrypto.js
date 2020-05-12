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

// Read the victory gifs from the file
var VictoryGifs = Fs.readFileSync("./victorygifs.txt").toString();
var VictoryGifList = VictoryGifs.split(',');

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
    if (message.substring(0, 3).toLowerCase() == '!dc') {
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

        switch(args[0].toLowerCase()) {
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
                              \n!dc clues clue1, clue2, clue3 - Submit your clues when you are the Encryptor\
                              \n!dc guess 123 - Guess the order of the keywords\
                              \n!dc keywords word1, word2, word3, word4 - Guess the opponent\'s keywords during a tiebreaker'
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
                } else if (gameProperties.blackTeamMembers.length < 2 || gameProperties.whiteTeamMembers.length < 2) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'Each team must have at least 2 members'
                    });
                } else {
                    gameProperties.selectingTeams = false;

                    // Short pause between executions helps lessen the info dump that happens here
                    sendKeywordsToTeams(gameProperties);
                    setTimeout(() => { sendCodeToNextEncryptor(gameProperties); }, 1000);                      
                }
                break;
            // Clues submitted by the team Encryptor
            case 'clue':
            case 'clues':
                if (!gameProperties.gameInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game currently in progress, type \'!dc start\' to begin one'
                    });
                } else if (gameProperties.selectingTeams) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'Team selection is still in progress, it\'s too early for clues'
                    });
                } else if (gameProperties.tiebreakInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'A tiebreaker is in progress, the time for clues has passed'
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
            // Guess the current code
            case 'guess':
                if (!gameProperties.gameInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game currently in progress, type \'!dc start\' to begin one'
                    });
                } else if (gameProperties.selectingTeams) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'Team selection is still in progress, chill out with your guesses'
                    });
                } else if (gameProperties.tiebreakInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'A tiebreaker is in progress, the time for guesses has passed'
                    });
                } else if (gameProperties.currentClues.length == 0) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'No clues have been given yet, cool your jets'
                    });
                } else {
                    validateAndRecordCodeGuess(args[1], userID, gameProperties);
                }
                break;
            // Guess the opponents keywords during a tiebreaker
            case 'keyword':
            case 'keywords':
                if (!gameProperties.gameInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'There\'s no game currently in progress, type \'!dc start\' to begin one'
                    });
                } else if (!gameProperties.tiebreakInProgress) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'There is no tiebreaker currently in progress, you don\'t need to guess keywords just yet'
                    });
                } else {
                    validateAndRecordKeywordGuesses(args, userID, gameProperties);

                    if (gameProperties.blackTeamKeywordGuess.length == 4 && gameProperties.whiteTeamKeywordGuess.length ==4) {
                        setTimeout(() => { scoreKeywordGuesses(gameProperties) }, 1000);
                    }
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

    for (var i = 0; i < keywordsToUse.length; i++) {
        if (i < 4) {
            gameProperties.blackTeamKeywords[i] = keywordsToUse[i];
        } else {
            gameProperties.whiteTeamKeywords[i] = keywordsToUse[i];
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
    var currentCode = CodeList[Math.floor(Math.random()*CodeList.length)];

    for (var i = 0; i < currentCode.length; i++) { 
        gameProperties.currentCode.push(currentCode.charAt(i)); 
    } 
    
    gameProperties.currentTeam = gameProperties.nextTurn;
    
    if (gameProperties.currentTeam == 'black') {
        gameProperties.currentEncryptor = gameProperties.blackTeamMembers[gameProperties.nextBlackEncryptor];

        gameProperties.nextBlackEncryptor += 1;

        if (gameProperties.nextBlackEncryptor == gameProperties.blackTeamMembers.length) {
            gameProperties.nextBlackEncryptor = 0;
        }
    } else {
        gameProperties.currentEncryptor = gameProperties.whiteTeamMembers[gameProperties.nextWhiteEncryptor];

        gameProperties.nextWhiteEncryptor += 1;

        if (gameProperties.nextWhiteEncryptor == gameProperties.whiteTeamMembers.length) {
            gameProperties.nextWhiteEncryptor = 0;
        }
    }

    gameProperties.nextTurn = otherTeam(gameProperties.currentTeam);

    bot.sendMessage({
        to: gameProperties.currentEncryptor.userID,
        message: 'Your code is ' + currentCode
    });

    bot.sendMessage({
        to: gameProperties.channelID,
        message: 'It is the ' + gameProperties.currentTeam + ' team\'s turn\
                 \n' + gameProperties.currentEncryptor.user + ' is their Encryptor this round, and has been sent a code\
                 \nWhen you are ready ' + gameProperties.currentEncryptor.user + ', submit your clues using \'!dc clues clue1, clue2, clue3\'\
                 \nDon\'t forget the commas, I won\'t understand you otherwise'
    });

    setTimeout(() => {  if (gameProperties.currentTeam == 'black' && gameProperties.blackTeamClues.length > 0) {
                            bot.sendMessage({
                                to: gameProperties.channelID,
                                message: '---------------------------------------------------------------------------\
                                         \nThe black team\'s known clues are:\
                                         \n1 - ' + gameProperties.blackTeamClues[0] + '\
                                         \n2 - ' + gameProperties.blackTeamClues[1] + '\
                                         \n3 - ' + gameProperties.blackTeamClues[2] + '\
                                         \n4 - ' + gameProperties.blackTeamClues[3]
                            });
                        } else if(gameProperties.whiteTeamClues.length > 0) {
                            bot.sendMessage({
                                to: gameProperties.channelID,
                                message: '---------------------------------------------------------------------------\
                                         \nThe white team\'s known clues are:\
                                         \n1 - ' + gameProperties.blackTeamClues[0] + '\
                                         \n2 - ' + gameProperties.blackTeamClues[1] + '\
                                         \n3 - ' + gameProperties.blackTeamClues[2] + '\
                                         \n4 - ' + gameProperties.blackTeamClues[3]
                            });
                        }
                    }, 1000);
}

// Validate that 3 clues have been submitted and record them
function validateAndRecordClues(args, gameProperties) {    
    var cluesList = "";
    
    // args is split by ' ', need to recombine and split by ',' to get the clues
    // args[0] will always have been the command word 'clues', so start at 1
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
                      \n' + gameProperties.currentClues[2] + '\
                      \n---------------------------------------------------------------------------'
        });

        setTimeout(() => { bot.sendMessage({
                                to: gameProperties.channelID,
                                message: 'The ' + otherTeam(gameProperties.currentTeam) + ' team should now submit a guess using \'!dc guess 123\'\
                                          \nOnly the first guess submitted from each team will be accepted'
                            });
                        }, 1000);
    } else {
        bot.sendMessage({
            to: gameProperties.channelID,
            message: 'You have to submit 3 clues'
        });

        gameProperties.currentClues = [];
    }
}

// Validate that 3 digits have been submitted and that they are the first guess for a team, then record them
function validateAndRecordCodeGuess(guess, userID, gameProperties) {    
    if (guess == null || guess.length != 3 || guess != parseInt(guess) || guess.indexOf('.') > -1) {
        bot.sendMessage({
            to: gameProperties.channelID,
            message: 'Your guess must be 3 digits' 
        });
        return;
    }

    var playerIndex = gameProperties.blackTeamMembers.findIndex(element => element.userID == userID);

    if (playerIndex > -1) {
        if (gameProperties.blackTeamGuess.length > 0) {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'Black team have already entered their guess' 
            });
            return;            
        }        

        for (var i = 0; i < guess.length; i++) {
            if (gameProperties.blackTeamGuess.indexOf(guess.charAt(i)) > -1 ) {
                bot.sendMessage({
                    to: gameProperties.channelID,
                    message: 'Your cannot enter the same digit multiple times' 
                });
                gameProperties.blackTeamGuess = [];
                return;
            }
            gameProperties.blackTeamGuess.push(guess.charAt(i)); 
        } 

        if (gameProperties.currentTeam == 'black' && gameProperties.whiteTeamGuess.length != 3) {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'It was the white team\'s turn to guess but oh well, you\'ve only hurt yourselves' 
            });
        } else {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'The white team should now submit a guess using \'!dc guess 123\''
            });
        }
    } else {
        playerIndex = gameProperties.whiteTeamMembers.findIndex(element => element.userID == userID);

        if (playerIndex > -1) {
            if (gameProperties.whiteTeamGuess.length > 0) {
                bot.sendMessage({
                    to: gameProperties.channelID,
                    message: 'White team have already entered their guess' 
                });
                return;  
            }      

            for (var i = 0; i < guess.length; i++) {
                if (gameProperties.whiteTeamGuess.indexOf(guess.charAt(i)) > -1 ) {
                    bot.sendMessage({
                        to: gameProperties.channelID,
                        message: 'Your cannot enter the same digit multiple times' 
                    });
                    gameProperties.whiteTeamGuess = [];
                    return;
                }
                gameProperties.whiteTeamGuess.push(guess.charAt(i));
            }

            if (gameProperties.currentTeam == 'white' && gameProperties.blackTeamGuess.length != 3) {
                bot.sendMessage({
                    to: gameProperties.channelID,
                    message: 'It was the black team\'s turn to guess but oh well, you\'ve only hurt yourselves' 
                });
            } else {
                bot.sendMessage({
                    to: gameProperties.channelID,
                    message: 'The black team should now submit a guess using \'!dc guess 123\''
                });
            }
        } else {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'You\'re not on a team, so can\'t make a guess. Why not join in next round?'
            });
        }
    }

    if (gameProperties.blackTeamGuess.length == 3 && gameProperties.whiteTeamGuess.length == 3) {
        bot.sendMessage({
            to: gameProperties.channelID,
            message: 'Both teams have recorded guesses, let\'s see how you did\
                      \n---------------------------------------------------------------------------'
        });

        setTimeout(() => { scoreRound(gameProperties); }, 1000);
    }
}

// Scores the current round once guesses have been submitted
function scoreRound(gameProperties) {
    var pointsScored = false;
    
    bot.sendMessage({
        to: gameProperties.channelID,
        message: 'The correct code was ' + gameProperties.currentCode[0]  + gameProperties.currentCode[1]  + gameProperties.currentCode[2]
    });

    if (gameProperties.currentTeam == 'black') {
        if (gameProperties.currentCode[0] != gameProperties.blackTeamGuess[0]
            || gameProperties.currentCode[1] != gameProperties.blackTeamGuess[1]
            || gameProperties.currentCode[2] != gameProperties.blackTeamGuess[2]) {
            gameProperties.blackTeamMiscommunicationTokens += 1;
            pointsScored = true;

            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'The black team guessed incorrectly, and have recieved a miscommunication token'
            });
        }

        if (gameProperties.currentCode[0] == gameProperties.whiteTeamGuess[0]
            && gameProperties.currentCode[1] == gameProperties.whiteTeamGuess[1]
            && gameProperties.currentCode[2] == gameProperties.whiteTeamGuess[2]) {
            gameProperties.whiteTeamInterceptionTokens += 1;
            pointsScored = true;

            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'The white team guessed correctly, and have recieved an interception token'
            });
        }
    } else {
        if (gameProperties.currentCode[0] != gameProperties.whiteTeamGuess[0]
            || gameProperties.currentCode[1] != gameProperties.whiteTeamGuess[1]
            || gameProperties.currentCode[2] != gameProperties.whiteTeamGuess[2]) {
            gameProperties.whiteTeamMiscommunicationTokens += 1;
            pointsScored = true;

            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'The white team guessed incorrectly, and have recieved a miscommunication token'
            });
        }

        if (gameProperties.currentCode[0] == gameProperties.blackTeamGuess[0]
            && gameProperties.currentCode[1] == gameProperties.blackTeamGuess[1]
            && gameProperties.currentCode[2] == gameProperties.blackTeamGuess[2]) {
            gameProperties.blackTeamInterceptionTokens += 1;
            pointsScored = true;

            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'The black team guessed correctly, and have recieved an interception token'
            });
        }
    }

    if (!pointsScored) {
        bot.sendMessage({
            to: gameProperties.channelID,
            message: 'No points were scored this round'
        });
    }

    bot.sendMessage({
        to: gameProperties.channelID,
        message: '---------------------------------------------------------------------------'
    });

    setTimeout(() => {  if (gameProperties.currentTeam == 'white') {
                            startNewRound(gameProperties);
                        } else {        
                            bot.sendMessage({
                                to: gameProperties.channelID,
                                message: 'The scores are:\
                                          \nBlack Team - ' + gameProperties.blackTeamInterceptionTokens + '/2 Interception Tokens, ' + gameProperties.blackTeamMiscommunicationTokens + '/2 Miscommuniction Tokens\
                                          \nWhite Team - ' + gameProperties.whiteTeamInterceptionTokens + '/2 Interception Tokens, ' + gameProperties.whiteTeamMiscommunicationTokens + '/2 Miscommuniction Tokens\
                                          \n---------------------------------------------------------------------------'
                            });

                            checkEndGameOrNewRound(gameProperties)
                        }
                    }, 1000);
}

// Check if victory conditions have been met by either team
// End game if they have, continue if they haven't
function checkEndGameOrNewRound(gameProperties) {
    var blackTeamWins = false;
    var whiteTeamWins = false;

    if (gameProperties.blackTeamMiscommunicationTokens == 2) {
        whiteTeamWins = true;
    }
    if (gameProperties.blackTeamInterceptionTokens == 2) {
        blackTeamWins = true;
    }
    if (gameProperties.whiteTeamMiscommunicationTokens == 2) {
        blackTeamWins = true;
    }
    if (gameProperties.whiteTeamInterceptionTokens == 2) {
        whiteTeamWins = true;
    }

    if (!blackTeamWins && !whiteTeamWins) {
        if (gameProperties.roundNumber == 8) {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'The 8th round has ended with no winner so the game is a draw, we will go to a tiebreaker\
                          \n---------------------------------------------------------------------------'
            });

            setTimeout(() => { tiebreaker(gameProperties); }, 1000)
        } else {
            startNewRound(gameProperties);
        }
    } else {
        if (blackTeamWins && whiteTeamWins) {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'The game is a draw, we will go to a tiebreaker\
                          \n---------------------------------------------------------------------------'
            });

            setTimeout(() => { tiebreaker(gameProperties); }, 1000)
        } else {
            if (blackTeamWins) {
                victory('black', GameProperties);
            } else {
                victory('white', GameProperties);
            }
        }
    }
}

// Tiebreaker if the game is drawn
function tiebreaker(gameProperties) {
    gameProperties.tiebreakInProgress = true;

    var blackTeamPoints = gameProperties.blackTeamInterceptionTokens - gameProperties.blackTeamMiscommunicationTokens;
    var whiteTeamPoints = gameProperties.whiteTeamInterceptionTokens - gameProperties.whiteTeamMiscommunicationTokens;

    bot.sendMessage({
        to: gameProperties.channelID,
        message: 'Tiebreak Points (1 per interception, -1 per miscommunication:\
                  \nBlack Team - ' + blackTeamPoints + ' points\
                  \nWhite Team - ' + whiteTeamPoints + ' points\
                  \n---------------------------------------------------------------------------'
    });

    setTimeout(() => {  if (blackTeamPoints > whiteTeamPoints) {
                            victory('black', gameProperties);
                            endGame();
                        } else if (blackTeamPoints < whiteTeamPoints) {
                            victory('white', gameProperties);
                            endGame();
                        } else {
                            bot.sendMessage({
                                to: gameProperties.channelID,
                                message: 'The game is still tied, you should now attempt to guess the opposing team\'s keywords\
                                          \nOne point will be awarded per correct guess\
                                          \nSubmit your guesses using \'!dc keywords word1, word2, word3, word4\'\
                                          \nOnly the first subission from each team will be accepted\
                                          \nNote that despite the name, a keyword can be multiple words (e.g. Roman Empire)'
                            });
                        }
                    }, 1000);    
}

// Validate and record keyword guesses for the tiebreaker
function validateAndRecordKeywordGuesses(args, userID, gameProperties) {
    var keywordsList = "";
    
    // args is split by ' ', need to recombine and split by ',' to get the keywords
    // args[0] will always have been the command word 'keywords', so start at 1
    for (var i = 1; i < args.length; i++) {
        keywordsList = keywordsList + " " + args[i];
    }

    var playerIndex = gameProperties.blackTeamMembers.findIndex(element => element.userID == userID);

    if (playerIndex > -1) {
        if (gameProperties.blackTeamKeywordGuess.length > 0) {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'Black team have already submitted a guess, no takebacks'
            });
            return;
        }

        gameProperties.blackTeamKeywordGuess = keywordsList.split(',');

        if (gameProperties.blackTeamKeywordGuess.length != 4) {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'You have to submit 4 keywords'
            });
            gameProperties.blackTeamKeywordGuess = [];
            return;
        }

        bot.sendMessage({
            to: gameProperties.channelID,
            message: 'Black team\'s guess has been recorded'
        });
    } else {
        playerIndex = gameProperties.whiteTeamMembers.findIndex(element => element.userID == userID);

        if (playerIndex > -1) {
            if (gameProperties.whiteTeamKeywordGuess.length > 0) {
                bot.sendMessage({
                    to: gameProperties.channelID,
                    message: 'White team have already submitted a guess, no takebacks'
                });
                return;
            }
    
            gameProperties.whiteTeamKeywordGuess = keywordsList.split(',');
    
            if (gameProperties.whiteTeamKeywordGuess.length != 4) {
                bot.sendMessage({
                    to: gameProperties.channelID,
                    message: 'You have to submit 4 keywords'
                });
                gameProperties.whiteTeamKeywordGuess = [];
                return;
            }
    
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'White team\'s guess has been recorded'
            });
        } else {
            bot.sendMessage({
                to: gameProperties.channelID,
                message: 'You\'re not on a team, so can\'t make a guess. Why not join in next round?'
            });
        }
    }
}

// Score each team's keyword guesses for the tiebreaker
function scoreKeywordGuesses(gameProperties) {
    var blackTeamScore = 0;
    var whiteTeamScore = 0;

    for (var i = 0; i < 4; i++) {
        if (gameProperties.blackTeamKeywords[i].toLowerCase() == gameProperties.blackTeamKeywordGuess[i].toLowerCase()) {
            blackTeamScore += 1;
        }
        if (gameProperties.whiteTeamKeywords[i].toLowerCase() == gameProperties.whiteTeamKeywordGuess[i].toLowerCase()) {
            whiteTeamScore += 1;
        }
    }
        
    bot.sendMessage({
        to: gameProperties.channelID,
        message: 'Black Team have guessed ' + blackTeamScore + ' keywords correctly\
                  \n 1 - Guess: ' + gameProperties.blackTeamKeywordGuess[0] + ', Answer: ' + gameProperties.blackTeamKeywords[0] + '\
                  \n 2 - Guess: ' + gameProperties.blackTeamKeywordGuess[1] + ', Answer: ' + gameProperties.blackTeamKeywords[1] + '\
                  \n 3 - Guess: ' + gameProperties.blackTeamKeywordGuess[2] + ', Answer: ' + gameProperties.blackTeamKeywords[2] + '\
                  \n 4 - Guess: ' + gameProperties.blackTeamKeywordGuess[3] + ', Answer: ' + gameProperties.blackTeamKeywords[3] + '\
                  \n---------------------------------------------------------------------------'
    });

    setTimeout(() => {  bot.sendMessage({
                            to: gameProperties.channelID,
                            message: 'White Team have guessed ' + whiteTeamScore + ' keywords correctly\
                                      \n 1 - Guess: ' + gameProperties.whiteTeamKeywordGuess[0] + ', Answer: ' + gameProperties.whiteTeamKeywords[0] + '\
                                      \n 2 - Guess: ' + gameProperties.whiteTeamKeywordGuess[1] + ', Answer: ' + gameProperties.whiteTeamKeywords[1] + '\
                                      \n 3 - Guess: ' + gameProperties.whiteTeamKeywordGuess[2] + ', Answer: ' + gameProperties.whiteTeamKeywords[2] + '\
                                      \n 4 - Guess: ' + gameProperties.whiteTeamKeywordGuess[3] + ', Answer: ' + gameProperties.whiteTeamKeywords[3] + '\
                                      \n---------------------------------------------------------------------------'
                        });

                        setTimeout(() => {  if (blackTeamScore > whiteTeamScore) {
                                                victory('black', gameProperties);
                                            } else if (blackTeamScore < whiteTeamScore) {
                                                victory('white', gameProperties);
                                            } else {
                                                bot.sendMessage({
                                                    to: gameProperties.channelID,
                                                    message: 'After all of that it\'s still a tie\
                                                              \nHow very boring\
                                                              \nWhy not try again and see if you can achieve a result this time'
                                                });
                                            }

                                        }, 1000)
                    }, 1000)
}

// Someone has won a glorious victory
function victory(team, gameProperties) {
    var victoryGif = VictoryGifList[Math.floor(Math.random()*VictoryGifList.length)];

    bot.sendMessage({
        to: gameProperties.channelID,
        message: 'Congratulations ' + team + ' team, you have achieved glorious victory\
                  \n' + victoryGif
    });

    setTimeout(() => { bot.sendMessage({
                            to: gameProperties.channelID,
                            message: 'Thanks for playing'
                        });
                    }, 1000);
 
    endGame();
}

// Start a new round of the game
function startNewRound(gameProperties) {
    if (gameProperties.currentTeam == 'black') {
        for (var i = 0; i < 3; i++) {
            if (gameProperties.blackTeamClues.length == 0) {
                gameProperties.blackTeamClues = ["", "", "", ""];
            }
            
            if (gameProperties.blackTeamClues[gameProperties.currentCode[i]] == "") {
                gameProperties.blackTeamClues[gameProperties.currentCode[i]] = gameProperties.currentClues[i];
            } else {
                gameProperties.blackTeamClues[gameProperties.currentCode[i]] = gameProperties.blackTeamClues[gameProperties.currentCode[i]] + ', ' + gameProperties.currentClues[i];
            }
        }
    } else {
        for (var i = 0; i < 3; i++) {
            if (gameProperties.whiteTeamClues.length == 0) {
                gameProperties.whiteTeamClues = ["", "", "", ""];
            }
            
            if (gameProperties.whiteTeamClues[gameProperties.currentCode[i]] == "") {
                gameProperties.whiteTeamClues[gameProperties.currentCode[i]] = gameProperties.currentClues[i];
            } else {
                gameProperties.whiteTeamClues[gameProperties.currentCode[i]] = gameProperties.whiteTeamClues[gameProperties.currentCode[i]] + ', ' + gameProperties.currentClues[i];
            }
        }
    }

    gameProperties.blackTeamGuess = [];
    gameProperties.whiteTeamGuess = [];
    gameProperties.currentCode = [];
    gameProperties.currentTeam = "";
    gameProperties.currentEncryptor = null;
    gameProperties.currentClues = [];
    gameProperties.roundNumber += 1;

    sendCodeToNextEncryptor(gameProperties);
}

function otherTeam(team) {
    if (team == 'black') {
        return 'white';
    } else {
        return 'black';
    }
}

// Ends the game by resetting its properties
function endGame(gameProperties) {
    Logger.debug('Ending game in channel ' + gameProperties.channelID);

    gameProperties.gameInProgress = false;
    gameProperties.selectingTeams = false;
    gameProperties.tiebreakInProgress = false;
    gameProperties.blackTeamMembers = [];
    gameProperties.nextBlackEncryptor = 0;
    gameProperties.blackTeamKeywords = [];
    gameProperties.blackTeamGuess = [];
    gameProperties.blackTeamInterceptionTokens = 0;
    gameProperties.blackTeamMiscommunicationTokens = 0;
    gameProperties.blackTeamClues = [];
    gameProperties.blackTeamKeywordGuess = [];
    gameProperties.whiteTeamMembers = [];
    gameProperties.nextWhiteEncryptor = 0;
    gameProperties.whiteTeamKeywords = [];
    gameProperties.whiteTeamGuess = [];
    gameProperties.whiteTeamInterceptionTokens = 0;
    gameProperties.whiteTeamMiscommunicationTokens = 0;
    gameProperties.whiteTeamClues = [];
    gameProperties.whiteTeamKeywordGuess = [];
    gameProperties.nextTurn = 'white';
    gameProperties.currentCode = [];
    gameProperties.currentTeam = "";
    gameProperties.currentEncryptor = null;
    gameProperties.currentClues = [];
    gameProperties.roundNumber = 1;
}

// Each game in progress is stored in an instance of GameProperties
function GameProperties (channelID, now) {
    this.channelID = channelID;
    this.gameInProgress = false;
    this.selectingTeams = false;
    this.tiebreakInProgress = false;
    this.blackTeamMembers = [];
    this.nextBlackEncryptor = 0
    this.blackTeamKeywords = [];
    this.blackTeamGuess = [];
    this.blackTeamInterceptionTokens = 0;
    this.blackTeamMiscommunicationTokens = 0;
    this.blackTeamClues = [];
    this.blackTeamKeywordGuess = [];
    this.whiteTeamMembers = [];
    this.nextWhiteEncryptor = 0;
    this.whiteTeamKeywords = [];
    this.whiteTeamGuess = [];
    this.whiteTeamInterceptionTokens = 0;
    this.whiteTeamMiscommunicationTokens = 0;
    this.whiteTeamClues = [];
    this.whiteTeamKeywordGuess = [] ;
    this.lastGameStartTime = now;
    this.nextTurn = 'white';
    this.currentCode = [];
    this.currentTeam = "";
    this.currentEncryptor = null;
    this.currentClues = [];
    this.roundsPlayed = 1;
}

// Each player in a team is stored in an instance of Player
function Player (userID, user) {
    this.userID = userID;
    this.user = user;
}