const express = require('express'), // Express web server framework
      cookieParser = require('cookie-parser'),
      mongoose = require('mongoose'),
      cookiesMiddleware = require('universal-cookie-express'),
      bodyParser = require('body-parser')

// set parameters for database
const CONFIG = require('../src/config.json'),
      mongoHost = CONFIG.mongoHost,
      mongoPort = CONFIG.mongoPort,
      url = `mongodb://${mongoHost}:${mongoPort}`,
      mongoOptions = {
        useNewUrlParser: true,
        useCreateIndex: true,
        useUnifiedTopology: true,
        user: CONFIG.mongoUser,
        pass: CONFIG.mongoPass,
        dbName: CONFIG.dbName
      }

// connect to database
mongoose.connect(url, mongoOptions)
.catch(() => { console.error("Error! Could not connect to mongodb database at "+url) })

const connection = mongoose.connection
connection.once('open', () => { console.log("MongoDB database connection established successfully") })

// init express
const app = express();

// load middleware for express
app
.use(express.json())
.use(bodyParser.json())
.use(cookiesMiddleware())
.use(cookieParser()) // required to set spotify autkkey cookie

// load all routes
const spotify =   require('./routes/spotify'),
      account =   require('./routes/account'),
      deezer =    require('./routes/deezer'),
      match =     require('./routes/match'),
      download =  require('./routes/download'),
      plex =      require('./routes/plex');

// use the routes
app
.use('/api/spotify',  spotify)
.use('/api/account',  account)
.use('/api/deezer',   deezer)
.use('/api/match',    match)
.use('/api/download', download)
.use('/api/plex',     plex);

app.listen(8888)
console.log('Listening on 8888')


// const SongMatch = require('./models/songMatch.model')
// setTimeout(() => {
//   SongMatch.deleteMany({ createdAt: { $gte: new Date("2021-01-01") } })
//   .then(() => console.log("deleted many"))
//   .catch(err => console.log("could not delete many", err))
// }, 1000)