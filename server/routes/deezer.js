const router = require('express').Router();
var querystring = require('querystring');
const axios = require('axios');

let app_id = '414682'; // Your client id
let secret = 'c05748d94bfc8af41c09d8820002de30'; // Your secret
let redirect_uri = 'https://music.plexx.tk/api/deezer/redirect'; // Your redirect uri
let perms = 'basic_access'; //the permissions required for this app to work

const DeezerToken = require('../models/deezerToken.model');

router.route('/auth').get((req, res) => {
  let url = 'https://connect.deezer.com/oauth/auth.php?'+
            querystring.stringify({
              app_id,
              redirect_uri,
              perms
            });

  res.redirect(url);
});

//handle the callback from deezer, save code and key to database
router.route('/redirect').get((req, res) => {
  let code = req.query.code || null,
      name = req.cookies ? req.universalCookies.get('identity').name : null;

  if (!name) {
    console.log("unidentified cookie!");
    res.redirect('/');
  }
  
  if (code) {
    let options = {
      app_id,
      secret,
      code,
      output: 'json'
    }

    axios.get('https://connect.deezer.com/oauth/access_token.php?'+querystring.stringify(options))
    .then(result => {
      let access_token = result.data.access_token;

      axios.get("https://api.deezer.com/user/me?"+
                querystring.stringify({access_token}))
      .then(result => {
        let deezerName = result.data.name;

        console.log("name: "+name);
        console.log("deezerName: "+deezerName);
        console.log("access_token: "+access_token);

        const newToken = new DeezerToken({name, deezerName, access_token});

        newToken.save()
        .then(() => {
          console.log("Saved deezerToken for "+name);
          res.redirect('/');
        })
        .catch(err => {
          console.log("Could not save deezerToken for "+name);
          console.log(err);
          res.redirect('/');
        })
      })
      .catch(err => { res.redirect('/') })
    })
    .catch(err => { res.redirect('/') })
  } else {
    console.log("Did not receive token!");
    res.redirect('/');
  }
});

router.route('/gettoken').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null;

  if (!name) {
    console.log("no name cookie");
    return res.status(400).json({token: null});
  } else {
    console.log("received deezerToken request, name: ", name)

    DeezerToken.findOne({name})
    .then(result => {
      axios.get('https://api.deezer.com/user/me?'+querystring.stringify({access_token: result.access_token}))
      .then(() => { return res.json({token: result.access_token, name: result.deezerName}) })
      .catch(err => {
        console.log("invalid deezerToken");
        return res.json({token: null});
      })
    })
    .catch(() => { return res.json({token: null}) })
  }
});

router.route('/logout').get((req, res) => {
  //console.log(this.props.openSettings)
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null;

  if (!name) {
    return res.status(400).json({error: 'Not signed in'});
  } else {
    DeezerToken.deleteOne({name})
    .then(() => { return res.json(name+" logged out of Deezer") })
    .catch(err => { return res.status(400).json({error: err}) })
  }
});

router.route('/searchTrackByID').get((req, res) => {
  const id = req.query.deezerID ? req.query.deezerID : undefined;

  if (!id) return res.json({error: "no track id"});
  
  axios.get('https://api.deezer.com/track/'+id)
  .then(result => {
    if (result.data.error) return res.json({error: result.data.error});
    
    let artists = new Array();

    for (let i = 0; i < result.data.contributors.length; i++) { // contributors is sometimes undefined
      artists.push({
        name: result.data.contributors[i].name,
        id: result.data.contributors[i].id
      })
    }

    let track = {
      id: result.data.id,
      title: result.data.title,
      artists,
      album: result.data.album.title,
      albumID: result.data.album.id,
      duration: result.data.duration
    }

    if (track.duration%60 < 10) {
      track.duration = Math.floor(track.duration/60)+":0"+track.duration%60
    } else {
      track.duration = Math.floor(track.duration/60)+":"+track.duration%60
    }
      
    return res.json({track});
  })
  .catch(err => {
    console.error(err)
    return res.json({error: "could not get info for id"})
  })
});



module.exports = router;