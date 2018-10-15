const 
  Telegraf = require('telegraf')
  Extra = require('telegraf/extra')
  Markup = require('telegraf/markup')
  LocalSession = require('telegraf-session-local')
  fs = require('fs')
  csv  = require('csv-parser')
  _ = require('lodash')

const HanziToEnglish = {};
const EnglishToHanzi = {};
const Lessons = [];

fs.createReadStream('dictionary.csv',{start: 1})
.pipe(csv())
.on('data', function(data){
    try {
        //perform the operation
        HanziToEnglish[data["SH"]] = data["RSH Keyword"];
        EnglishToHanzi[data["RSH Keyword"]] = data["SH"];
        Lessons.push({
            hanzi: data["SH"],
            english: data["RSH Keyword"],
            pinyin: data["RTH Read"]
        });
    }
    catch(err) {
        //error handler
    }
})
.on('end',function(){
    //some final operation
});  

const Bot = new Telegraf(process.env.BOT_TOKEN) // Your Bot token here
 
// Name of session property object in Telegraf Context (default: 'session')
const property = 'data'
 
const localSession = new LocalSession({
  // Database name/path, where sessions will be located (default: 'sessions.json')
  database: 'sessions.json',
  // Name of session property object in Telegraf Context (default: 'session')
  property: 'data',
  // Type of lowdb storage (default: 'storageFileSync')
  storage: LocalSession.storageFileAsync,
  // Format of storage/database (default: JSON.stringify / JSON.parse)
  format: {
    serialize: (obj) => JSON.stringify(obj, null, 2), // null & 2 for pretty-formatted JSON
    deserialize: (str) => JSON.parse(str),
  },
  // We will use lowdb instance from LocalSession via Telegraf Context
  state: { }
})
 
// Wait for database async initialization finished (storageFileAsync or your own asynchronous storage adapter)
localSession.DB.then(DB => {
  // Database now initialized, so now you can retrieve anything you want from it
  console.log('Current LocalSession DB:', DB.value())
  // console.log(DB.get('sessions').getById('1:1').value())
})
 
// Telegraf will use `telegraf-session-local` configured above middleware with overrided `property` name
Bot.use(localSession.middleware(property))

Bot.hears(/^max (\d+)$/, (ctx, next) => {
    ctx[property].max = Math.max(parseInt(ctx.match[1] || 0 ),0)
    ctx.replyWithMarkdown(`Updated \`${ctx.message.from.username}\`'s Max Character Recognition To: \`${ctx[property].max}\``)
})

Bot.hears(/^random (\d+)$/, (ctx, next) => {
    var maxWord = ctx[property].max || 0;
    var random = Math.min(Math.max(parseInt(ctx.match[1] || 0 ),0),maxWord);

    if(random > 0){
        var randomWords = [];
    
        for(var i=0; i<random; i++){
            do {
                var newRandomIndex = Math.floor(Math.random() * Math.floor(maxWord))
            } while (randomWords.includes(newRandomIndex))
            randomWords.push(newRandomIndex);
        }

        var hanziCharacters = _.map(randomWords,(randomIndex)=>Lessons[randomIndex].hanzi);
        
        ctx.reply(`Showing ${random} Hanzi Characters\n${_.join(hanziCharacters,"\n")}`,
        Markup
        .keyboard(
            hanziCharacters
        )
        .resize()
        .extra()
        );
    }
})

Bot.on('text', (ctx, next) => {
  var filteredEnglishWords = _.filter(Lessons.slice(0,ctx[property].max || 0), (entry)=>{
      var entryRegex = new RegExp("([^A-Za-z]|^)"+entry.english+"([^A-Za-z]|$)",'i');
      var searchResult = ctx.message.text.search(entryRegex);
      return searchResult != -1;
  });

  var filteredHanziWords = _.filter(Lessons.slice(0,ctx[property].max || 0), (entry)=>{
    var entryRegex = new RegExp(entry.hanzi,'i');
    var searchResult = ctx.message.text.search(entryRegex);
    return searchResult != -1;
});

  if(filteredEnglishWords.length > 0)
  {
    var hanziCharacters = _.map(filteredEnglishWords,(wordEntry)=>wordEntry.hanzi);

    ctx.reply(`Identified ${filteredEnglishWords.length} Possible Hanzi Characters\n${_.join(hanziCharacters,"\n")}`,
        Markup
        .keyboard(
            _.map(filteredEnglishWords,(wordEntry)=>wordEntry.hanzi)
        )
        .resize()
        .extra()
    );
  }

  if(filteredHanziWords.length > 0)
  {
    var msg = _.join(
        _.map(filteredHanziWords,(wordEntry)=>{
            return `\`${wordEntry.hanzi}\` has keyword \`${wordEntry.english}\``;
        })
        ,"\n");
    ctx.replyWithMarkdown(msg);
  }

  return next()
})
 
Bot.command('/stats', (ctx) => {
  let msg = `Using session object from [Telegraf Context](http://telegraf.js.org/context.html) (\`ctx\`), named \`${property}\`\n`
  ctx.replyWithMarkdown(msg)
})

Bot.command('/reset', (ctx) => {
  ctx.replyWithMarkdown(`Removing session from database: \`${JSON.stringify(ctx[property])}\``)
  // Setting session to null, undefined or empty object/array will trigger removing it from database
  ctx[property] = null
})
 
Bot.startPolling()