const router = require('express').Router(),
      { stringify } = require('querystring'),
      axios = require('axios'),
      { deezerID, deezerSecret, domainName } = require('../../src/config.json'),
      redirect_uri = `https://${domainName}/api/deezer/redirect`, // Your redirect uri
      perms = 'basic_access', //the permissions required for this app to work
      DeezerToken = require('../models/deezerToken.model')

router.route('/auth').get((req, res) => {
  return res.redirect('https://connect.deezer.com/oauth/auth.php?' + stringify({ app_id: deezerID, redirect_uri, perms }))
})

//handle the callback from deezer, save code and key to database
router.route('/redirect').get((req, res) => {
  let code = req.query.code || null,
      name = req.cookies ? req.universalCookies.get('identity').name : null

  if (!name) {
    console.log("unidentified cookie!")
    return res.redirect('/')
  }

  if (!code) {
    console.log("Did not receive token!")
    return res.redirect('/')
  }

  const options = {
    app_id: deezerID,
    secret: deezerSecret,
    code,
    output: 'json'
  }

  return axios.get('https://connect.deezer.com/oauth/access_token.php?' + stringify(options))
  .then(result => {
    let access_token = result.data.access_token

    return axios.get("https://api.deezer.com/user/me?" + stringify({access_token}))
    .then(result => {
      const deezerName = result.data.name
      console.log({ name, deezerName, access_token })

      const newToken = new DeezerToken({ name, deezerName, access_token })

      return newToken.save()
      .then(() => {
        console.log("Saved deezerToken for " + name)
        return res.redirect('/')
      })
      .catch(err => {
        console.log("Could not save deezerToken for " + name)
        console.log(err)
        return res.redirect('/')
      })
    })
    .catch(() => res.redirect('/'))
  })
  .catch(() => res.redirect('/'))
})

router.route('/gettoken').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null

  if (!name) {
    console.log("no name cookie")
    return res.status(400).json({token: null})
  }

  console.log("received deezerToken request, name: ", name)

  return DeezerToken.findOne({name})
  .then(result => {
    return axios.get('https://api.deezer.com/user/me?' + stringify({access_token: result.access_token}))
    .then(() => res.json({token: result.access_token, name: result.deezerName}))
    .catch(() => {
      console.log("invalid deezerToken")
      return res.json({token: null})
    })
  })
  .catch(() => res.json({token: null}))
})

router.route('/logout').get((req, res) => {
  //console.log(this.props.openSettings)
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null

  if (!name) return res.status(400).json({error: 'Not signed in'})

  return DeezerToken.deleteOne({name})
  .then(() => res.json(name+" logged out of Deezer"))
  .catch(err => res.status(400).json({error: err}))
})

router.route('/searchTrackByID').get((req, res) => {
  const id = req.query.deezerID ? req.query.deezerID : undefined

  if (!id) return res.json({error: "no track id"})

  return axios.get('https://api.deezer.com/track/'+id)
  .then(result => {
    if (result.data.error) return res.json({error: result.data.error})

    let artists = new Array()

    // contributors is sometimes undefined
    for (let i = 0; i < result.data.contributors.length; i++) artists.push({ name: result.data.contributors[i].name, id: result.data.contributors[i].id })

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

    return res.json({track})
  })
  .catch(err => {
    console.error(err)
    return res.json({error: "could not get info for id"})
  })
})

module.exports = router