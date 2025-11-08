process.env["NTBA_FIX_350"] = 1;
//const fs = require('fs');
//const path = require('path');
//const moment = require('moment');
const TelegramBot = require('node-telegram-bot-api');
const currentDir = (process.env.CURRENT_DIR) ? process.env.CURRENT_DIR : __dirname;
const token = (process.env.TOKEN_BOT) ? process.env.TOKEN_BOT : 'токена нету';
const chatId = (process.env.CHAT_ID) ? process.env.CHAT_ID : 'chatId нету';
const mess = (process.env.MESSAGE) ? process.env.MESSAGE : 'сообщения нету';
//console.log('token = '+token);//
//console.log('chatId = '+chatId);
//console.log('mess = '+mess);
//----------------------------------------------------
//запуск ботов
const Bot = new TelegramBot(token, {polling: false});
//---------------------------------------------------
const smilik = '¯\\_(ツ)_/¯';
//====================================================================.
Bot.sendMessage(chatId, mess/*, {parse_mode:"markdown"}*/);
//====================================================================

