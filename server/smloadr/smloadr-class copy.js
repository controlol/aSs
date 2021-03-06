const Promise = require('bluebird');
const sanitize = require('sanitize-filename');
const cacheManager = require('cache-manager');
require('./node_modules/cache-manager/lib/stores/memory');
const requestPlus = require('request-plus');
const id3Writer = require('./libs/browser-id3-writer');
const flacMetadata = require('./libs/flac-metadata');
const fs = require('fs');
const stream = require('stream');
const nodePath = require('path');

const EncryptionService = require('./libs/EncryptionService');
let encryptionService = new EncryptionService();

let DOWNLOAD_DIR = '/music/';

const musicQualities = {
    MP3_128: {
        id: 1,
        name: 'MP3 - 128 kbps',
        aproxMaxSizeMb: '100'
    },
    MP3_320: {
        id: 3,
        name: 'MP3 - 320 kbps',
        aproxMaxSizeMb: '200'
    },
    FLAC: {
        id: 9,
        name: 'FLAC - 1411 kbps',
        aproxMaxSizeMb: '700'
    },
    MP3_MISC: {
        id: 0,
        name: 'User uploaded song'
    }
};

const selectedMusicQuality = musicQualities.MP3_320;
const unofficialApiUrl = 'https://www.deezer.com/ajax/gw-light.php';

let smloadrClass = class {
    constructor() {
        this.downloadState = class {
            constructor() {
                this.currentlyDownloading = {};
                this.currentlyDownloadingPaths = [];
                this.downloading = false;
                this.numberTracksFinished = 0;
                this.numberTracksToDownload = 0;
                this.downloadType = '';
                this.downloadTypeId = 0;
                this.downloadTypeName = '';
                this.downloadedSuccessfully = null;
                this.downloadedUnsuccessfully = null;
                this.downloadedWithWarning = null;
            }
        
            start(downloadType, downloadTypeId) {
                this.downloading = true;
                this.downloadType = downloadType;
                this.downloadTypeId = downloadTypeId;
        
                this.display();
            }
        
            updateNumberTracksToDownload(numberTracksToDownload) {
                this.numberTracksToDownload = numberTracksToDownload;
            }
        
            finish(showFinishMessage = true) {
                this.downloading = false;
        
                if (showFinishMessage) {
                    let downloadTypeAndName = this.downloadType;
        
                    if (this.downloadTypeName) {
                        downloadTypeAndName += ' "' + this.downloadTypeName + '"';
                    }
                }
        
                this.currentlyDownloading = {};
                this.currentlyDownloadingPaths = [];
                this.numberTracksFinished = 0;
                this.numberTracksToDownload = 0;
                this.downloadType = '';
                this.downloadTypeId = 0;
                this.downloadTypeName = '';
            }
        
            setDownloadTypeName(downloadTypeName) {
                this.downloadTypeName = downloadTypeName;
        
                this.display();
            }
        
            add(trackId, message) {
        
                this.currentlyDownloading[trackId] = message;
        
                this.display();
            }
        
            update(trackId, message) {
                this.add(trackId, message);
            }
        
            remove(trackId) {
                delete this.currentlyDownloading[trackId];
        
                this.display();
            }
        
            success(trackId, message) {
        
                this.numberTracksFinished++;
                this.remove(trackId);
            }
        
            warn(trackId, message) {
                console.warn(message);

                this.numberTracksFinished++;
                this.remove(trackId);
            }
        
            fail(trackId, message) {
                console.error(message);
        
                this.numberTracksFinished++;
                this.remove(trackId);
            }
        
            display() {
                if (this.downloading) {
                    let downloadTypeAndName = this.downloadType;
        
                    if (this.downloadTypeName) {
                        downloadTypeAndName += ' "' + this.downloadTypeName + '"';
                    }
                }
            }
        
            addCurrentlyDownloadingPath(downloadPath) {
                this.currentlyDownloadingPaths.push(downloadPath);
            }
        
            removeCurrentlyDownloadingPath(downloadPath) {
                const index = this.currentlyDownloadingPaths.indexOf(downloadPath);
        
                if (-1 !== index) {
                    this.currentlyDownloadingPaths.splice(index, 1);
                }
            }
        
            isCurrentlyDownloadingPathUsed(downloadPath) {
                return (this.currentlyDownloadingPaths.indexOf(downloadPath) > -1);
            }
        }
        this.downloadStateInstance = new this.downloadState;
        this.unofficialApiQueries = {
            api_version: '1.0',
            api_token: '',
            input: 3
        };
        this.httpHeaders;
        this.requestWithoutCache;
        this.requestWithoutCacheAndRetry;
        this.requestWithCache;
        this.index = 0;
    }

    setDownloadPath(downloadLocation) {
        if (downloadLocation.charAt(downloadLocation.length-1) !== "/") downloadLocation += '/';

        DOWNLOAD_DIR = downloadLocation;

        return DOWNLOAD_DIR;
    }

    //init request parameters and set new arl
    //use this function to update the arl also
    initRequest(arl) {
        this.httpHeaders = {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.129 Safari/537.36',
            'cache-control': 'max-age=0',
            'accept-language': 'en-US,en;q=0.9,en-US;q=0.8,en;q=0.7',
            'accept-charset': 'utf-8,ISO-8859-1;q=0.8,*;q=0.7',
            'content-type': 'text/plain;charset=UTF-8',
            'cookie': 'arl=' + arl
        };

        let requestConfig = {
            retry: {
                attempts: 10,
                delay: 500, // .5 second
                errorFilter: error => 403 !== error.statusCode // retry all errors
            },
            defaults: {
                headers: this.httpHeaders,
            }
        };

        this.requestWithoutCache = requestPlus(requestConfig);


        let requestConfigWithoutCacheAndRetry = {
            defaults: {
                headers: this.httpHeaders
            }
        };

        this.requestWithoutCacheAndRetry = requestPlus(requestConfigWithoutCacheAndRetry);

        const cacheManagerCache = cacheManager.caching({
            store: 'memory',
            max: 1000
        });

        requestConfig.cache = {
            cache: cacheManagerCache,
            cacheOptions: {
                ttl: 3600 * 2 // 2 hours
            }
        };

        this.requestWithCache = requestPlus(requestConfig);
    }

    /**
     * Application init.
     */
    initApp(arl) {
        return new Promise((resolve, reject) => {
                process.on('unhandledRejection', (reason, p) => {
                reject(reason + '\nUnhandled Rejection at Promise' + JSON.stringify(p) + '\n');
            });

            process.on('uncaughtException', (err) => {
                console.error('\n' + err + '\nUncaught Exception thrown' + '\n');
                reject(err + '\nUncaught Exception thrown')
            });

            nodePath.normalize(DOWNLOAD_DIR).replace(/\/$|\\$/, '');

            this.initRequest(arl);
            this.startApp()
            .then(response => {
                resolve(response)
            })
        });
    }

    /**
     * Start the app.
     */
    startApp() {
        return new Promise((resolve, reject) => {        
            this.initDeezerApi()
            .then(() => {
                resolve('Connected to Deezer API');
            }).catch((err) => {
                if ('Wrong Deezer credentials!' === err) {
                    reject('Wrong Deezer credentials!');
                    configService.set('arl', null);
                    configService.saveConfig();

                    this.startApp();
                } else {
                    reject(err);
                }
            });
        })
    }

    /**
     * Create directories of the given path if they don't exist.
     *
     * @param {String} filePath
     * @return {boolean}
     */
    ensureDir(filePath) {
        const dirName = nodePath.dirname(filePath);

        if (fs.existsSync(dirName)) {
            return true;
        }

        this.ensureDir(dirName);
        fs.mkdirSync(dirName);
    }

    /**
     * Fetch and set the api token.
     */
    initDeezerApi() {
        return new Promise((resolve, reject) => {

            this.requestWithoutCacheAndRetry({
                method: 'POST',
                url: unofficialApiUrl,
                qs: Object.assign(this.unofficialApiQueries, {
                    method: 'deezer.getUserData',
                    cid: this.getApiCid()
                }),
                json: true,
                jar: true
            }).then((response) => {
                if (!response || 0 < Object.keys(response.error).length) {
                    throw 'Unable to initialize Deezer API.';
                } else {
                    if (response.results['USER']['USER_ID'] !== 0) {
                        this.requestWithoutCacheAndRetry({
                            method: 'POST',
                            url: unofficialApiUrl,
                            qs: Object.assign(this.unofficialApiQueries, {
                                method: 'deezer.getUserData',
                                cid: this.getApiCid()
                            }),
                            json: true,
                            jar: true
                        }).then((response) => {
                            if (!response || 0 < Object.keys(response.error).length) {
                                throw 'Unable to initialize Deezer API.';
                            } else {
                                if (response.results && response.results.checkForm) {

                                    this.unofficialApiQueries.api_token = response.results.checkForm;

                                    resolve();
                                } else {
                                    throw 'Unable to initialize Deezer API.';
                                }
                            }
                        }).catch((err) => {
                            if (404 === err.statusCode) {
                                err = 'Could not connect to Deezer.';
                            }

                            reject(err);
                        });
                    } else {
                        reject('Wrong Deezer credentials!');
                    }
                }
            });
        });
    }

    /**
     * Get a cid for a unofficial api request.
     *
     * @return {Number}
     */
    getApiCid() {
        return Math.floor(1e9 * Math.random());
    }

    /**
     * Remove empty files.
     *
     * @param {Object} filePaths
     */
    removeEmptyFiles(filePaths) {
        filePaths.forEach((filePath) => {
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf-8').trim();

                if ('' === fileContent) {
                    fs.unlinkSync(filePath);
                }
            }
        });
    }

    /**
     * Start a deezer download.
     *
     * @param {String}  deezerUrl
     * @param {Boolean} downloadFromFile
     */
    startDownload(deezerID, optimizeFS = false) {
        console.log("received request",deezerID)
        console.time(deezerID)
        return new Promise((resolve,reject) => {

            let deezerUrl = "https://www.deezer.com/us/track/"+deezerID;

            const deezerUrlParts = this.getDeezerUrlParts(deezerUrl);

            this.downloadStateInstance.start(deezerUrlParts.type, deezerUrlParts.id);

            if (deezerUrlParts.type === "track") {
                this.downloadStateInstance.updateNumberTracksToDownload(1);

                this.downloadSingleTrack(deezerUrlParts.id, {}, {}, false, optimizeFS)
                .then(result => {
                    this.downloadStateInstance.finish(true);
                    this.removeEmptyFiles([
                        'downloadedSuccessfully.txt',
                        'downloadedUnsuccessfully.txt',
                        'downloadedWithWarning.txt'
                    ]);
                    console.timeEnd(deezerID)
                    resolve({result: result.msg, filePath: result.filePath});
                })
                .catch(err => {
                    reject(err)
                })
            }
        })
    }

    /**
     * Get the url type (album/artist/playlist/profile/track) and the id from the deezer url.
     *
     * @param {String} deezerUrl
     *
     * @return {Object}
     */
    getDeezerUrlParts(deezerUrl) {
        const urlParts = deezerUrl.split(/\/(\w+)\/(\d+)/);

        return {
            type: urlParts[1],
            id: urlParts[2]
        };
    }

    /**
     * Download a track + id3tags (album cover...) and save it in the downloads folder.
     *
     * @param {Number}  id
     * @param {Object}  trackInfos
     * @param {Object}  albumInfos
     * @param {Boolean} isAlternativeTrack
     * @param {Number}  numberRetry
     */
    downloadSingleTrack(id, trackInfos = {}, albumInfos = {}, isAlternativeTrack = false, optimizeFS) {
        let dirPath;
        let saveFilePath;
        let originalTrackInfos;
        let fileExtension = 'mp3';
        let trackQuality;

        return new Promise((resolve, reject) => {
            let that = this;
            if ('-' === id.toString().charAt(0) && 0 < Object.keys(trackInfos).length) {
                this.getTrackAlternative(trackInfos).then((alternativeTrackInfos) => {
                    this.downloadStateInstance.remove(id);
                    this.downloadSingleTrack(alternativeTrackInfos.SNG_ID, {}, {}, true, optimizeFS).then(msg => {
                        resolve(msg);
                    });
                }).catch(() => {
                    startTrackInfoFetching();
                });
            } else {
                startTrackInfoFetching();
            }

            function startTrackInfoFetching() {
                if (!isAlternativeTrack && 0 < Object.keys(trackInfos).length) {
                    originalTrackInfos = trackInfos;

                    afterTrackInfoFetching();
                } else {
                    that.getTrackInfos(id)
                    .then((trackInfosResponse) => {
                        originalTrackInfos = trackInfosResponse;

                        afterTrackInfoFetching();
                    })
                    .catch((err) => {
                        errorHandling(err);
                    });
                }  
            }

            function afterTrackInfoFetching() {        
                if (!isAlternativeTrack || 0 === Object.keys(trackInfos).length) {
                    trackInfos = originalTrackInfos;
                }

                trackQuality = that.getValidTrackQuality(originalTrackInfos);

                originalTrackInfos.SNG_TITLE_VERSION = originalTrackInfos.SNG_TITLE;

                if (originalTrackInfos.VERSION) {
                    originalTrackInfos.SNG_TITLE_VERSION = (originalTrackInfos.SNG_TITLE + ' ' + originalTrackInfos.VERSION).trim();
                }

                if (0 < Object.keys(albumInfos).length || 0 === trackInfos.ALB_ID) {
                    afterAlbumInfoFetching();
                } else {
                    const downloadingMessage = trackInfos.ART_NAME + ' - ' + trackInfos.SNG_TITLE_VERSION;
                    that.downloadStateInstance.update(originalTrackInfos.SNG_ID, downloadingMessage);

                    that.getAlbumInfos(trackInfos.ALB_ID).then((albumInfosResponse) => {
                        albumInfos = albumInfosResponse;

                        albumInfos.TYPE = 'album';
                        albumInfos.GENRES = [];

                        afterAlbumInfoFetching();
                    }).catch(() => {
                        afterAlbumInfoFetching();
                    });
                }
            }

            function afterAlbumInfoFetching() {
                originalTrackInfos.ALB_UPC = '';
                originalTrackInfos.ALB_LABEL = '';
                originalTrackInfos.ALB_NUM_TRACKS = '';
                originalTrackInfos.ALB_NUM_DISCS = '';

                if (albumInfos.UPC) {
                    originalTrackInfos.ALB_UPC = albumInfos.UPC;
                }

                if (albumInfos.PHYSICAL_RELEASE_DATE && !trackInfos.ALB_RELEASE_DATE) {
                    originalTrackInfos.ALB_RELEASE_DATE = albumInfos.PHYSICAL_RELEASE_DATE;
                }

                if (albumInfos.SONGS && 0 < albumInfos.SONGS.data.length && albumInfos.SONGS.data[albumInfos.SONGS.data.length - 1].DISK_NUMBER) {
                    originalTrackInfos.ALB_NUM_DISCS = albumInfos.SONGS.data[albumInfos.SONGS.data.length - 1].DISK_NUMBER;
                }

                originalTrackInfos.ALB_ART_NAME = originalTrackInfos.ART_NAME;

                if (!originalTrackInfos.ARTISTS || 0 === originalTrackInfos.ARTISTS.length) {
                    originalTrackInfos.ARTISTS = [
                        {
                            ART_ID: originalTrackInfos.ART_ID,
                            ART_NAME: originalTrackInfos.ALB_ART_NAME,
                            ART_PICTURE: originalTrackInfos.ART_PICTURE
                        }
                    ];
                }

                if ('various' === originalTrackInfos.ALB_ART_NAME.trim().toLowerCase()) {
                    originalTrackInfos.ALB_ART_NAME = 'Various Artists';
                }

                if (albumInfos.LABEL_NAME) {
                    originalTrackInfos.ALB_LABEL = albumInfos.LABEL_NAME;
                }

                if (albumInfos.SONGS && albumInfos.SONGS.data.length) {
                    originalTrackInfos.ALB_NUM_TRACKS = albumInfos.SONGS.data.length;
                }

                const downloadingMessage = trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE_VERSION;
                that.downloadStateInstance.update(originalTrackInfos.SNG_ID, downloadingMessage);

                if (0 === trackInfos.ALB_ID) {
                    afterAlbumInfoOfficialApiFetching();
                } else {
                    that.getAlbumInfosOfficialApi(trackInfos.ALB_ID).then((albumInfosResponse) => {
                        albumInfos.TYPE = albumInfosResponse.record_type;
                        albumInfos.GENRES = [];

                        albumInfosResponse.genres.data.forEach((albumGenre) => {
                            albumInfos.GENRES.push(albumGenre.name);
                        });

                        afterAlbumInfoOfficialApiFetching();
                    }).catch(() => {
                        afterAlbumInfoOfficialApiFetching();
                    });
                }
            }

            function afterAlbumInfoOfficialApiFetching() {
                originalTrackInfos.ALB_GENRES = albumInfos.GENRES;

                if (albumInfos.TYPE) {
                    originalTrackInfos.ALB_RELEASE_TYPE = albumInfos.TYPE;
                }

                if (isAlternativeTrack) {
                    trackInfos.DURATION = originalTrackInfos.DURATION;
                    trackInfos.GAIN = originalTrackInfos.GAIN;
                    trackInfos.LYRICS_ID = originalTrackInfos.LYRICS_ID;
                    trackInfos.LYRICS = originalTrackInfos.LYRICS;
                } else {
                    trackInfos = originalTrackInfos;
                }

                if (trackQuality) {
                    let artistName = that.multipleWhitespacesToSingle(that.sanitizeFilename(trackInfos.ALB_ART_NAME));

                    if ('' === artistName.trim()) {
                        artistName = 'Unknown artist';
                    }

                    let albumName = that.multipleWhitespacesToSingle(that.sanitizeFilename(trackInfos.ALB_TITLE));

                    if ('' === albumName.trim()) {
                        albumName = 'Unknown album';
                    }                    

                    if (musicQualities.FLAC.id === trackQuality.id) {
                        fileExtension = 'flac';
                    }

                    if (optimizeFS) {
                        saveFilePath = nodePath.join(DOWNLOAD_DIR, artistName, albumName);
                        let artistPath = nodePath.dirname(saveFilePath)

                        //create artist folder if it does not exist
                        if(!fs.existsSync(artistPath)) {
                            fs.mkdirSync(artistPath);
                            fs.chmodSync(artistPath, 0o666); //folders created by node are created by the user node was started with, I run my application with root so change permissions
                        } 

                        //create album folder if it does not exist
                        if(!fs.existsSync(saveFilePath)) {
                            fs.mkdirSync(saveFilePath);
                            fs.chmodSync(saveFilePath, 0o666); //folders created by node are created by the user node was started with, I run my application with root so change permissions
                        } 

                        saveFilePath += "/";
                    } else {
                        saveFilePath = DOWNLOAD_DIR;
                    }                    

                    saveFilePath += artistName + ' - ' + that.multipleWhitespacesToSingle(that.sanitizeFilename(trackInfos.SNG_TITLE_VERSION)) + '.' + fileExtension;

                    if (!fs.existsSync(saveFilePath) && !that.downloadStateInstance.isCurrentlyDownloadingPathUsed(saveFilePath)) {
                        that.downloadStateInstance.addCurrentlyDownloadingPath(saveFilePath);

                        return that.downloadTrack(originalTrackInfos, trackQuality.id, saveFilePath).then((decryptedTrackBuffer) => {
                            onTrackDownloadComplete(decryptedTrackBuffer);
                        }).catch((error) => {

                            if (originalTrackInfos.FALLBACK && originalTrackInfos.FALLBACK.SNG_ID && trackInfos.SNG_ID !== originalTrackInfos.FALLBACK.SNG_ID && originalTrackInfos.SNG_ID !== originalTrackInfos.FALLBACK.SNG_ID) {
                                that.downloadStateInstance.removeCurrentlyDownloadingPath(saveFilePath);
                                that.downloadStateInstance.remove(originalTrackInfos.SNG_ID);

                                that.downloadSingleTrack(originalTrackInfos.FALLBACK.SNG_ID, trackInfos, albumInfos, true, optimizeFS).then(() => {
                                    resolve();
                                });

                                const error = {
                                    message: '-',
                                    name:    'notAvailableButAlternative'
                                };

                                errorHandling(error);
                            } else {
                                that.getTrackAlternative(trackInfos).then((alternativeTrackInfos) => {
                                    that.downloadStateInstance.removeCurrentlyDownloadingPath(saveFilePath);
                                    that.downloadStateInstance.remove(originalTrackInfos.SNG_ID);

                                    if (albumInfos.ALB_TITLE) {
                                        albumInfos = {};
                                    }

                                    that.downloadSingleTrack(alternativeTrackInfos.SNG_ID, trackInfos, albumInfos, true, optimizeFS).then(msg => {
                                        resolve(msg);
                                    });
                                }).catch(err => {
                                    const errorMessage = 'Deezer doesn\'t provide the song anymore';

                                    errorHandling(errorMessage);
                                });
                            }
                        });
                    } else { //do this if track is already downloaded
                        /* message prefix trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE_VERSION +  */
                        const error = {
                            message: 'Track already exists',
                            name:    'songAlreadyExists'
                        };

                        errorHandling(error);
                        
                    }
                } else {
                    errorHandling(trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE_VERSION + '\n  ??? Deezer doesn\'t provide the song anymore');
                }
            }

            function onTrackDownloadComplete(decryptedTrackBuffer) {
                let downloadMessageAppend = '';

                if (isAlternativeTrack && originalTrackInfos.SNG_TITLE_VERSION.trim().toLowerCase() !== trackInfos.SNG_TITLE_VERSION.trim().toLowerCase()) {
                    downloadMessageAppend = '\n  ??? Used "' + originalTrackInfos.ALB_ART_NAME + ' - ' + originalTrackInfos.SNG_TITLE_VERSION + '" as alternative';
                }

                if (trackQuality !== selectedMusicQuality) {
                    let selectedMusicQualityName = musicQualities[Object.keys(musicQualities).find(key => musicQualities[key] === selectedMusicQuality)].name;
                    let trackQualityName = musicQualities[Object.keys(musicQualities).find(key => musicQualities[key] === trackQuality)].name;

                    downloadMessageAppend += '\n  ??? Used "' + trackQualityName + '" because "' + selectedMusicQualityName + '" wasn\'t available';
                }

                const successMessage = '' + trackInfos.ALB_ART_NAME + ' - ' + trackInfos.SNG_TITLE_VERSION + '' + downloadMessageAppend;

                that.addTrackTags(decryptedTrackBuffer, trackInfos, saveFilePath).then(() => {
                    that.downloadStateInstance.success(originalTrackInfos.SNG_ID, successMessage);

                    that.downloadStateInstance.removeCurrentlyDownloadingPath(saveFilePath);

                    resolve({msg: "Download was successful "+downloadMessageAppend, filePath: saveFilePath});
                }).catch(() => {
                    const warningMessage = successMessage + '\n  ??? Failed writing ID3 tags';

                    that.downloadStateInstance.removeCurrentlyDownloadingPath(saveFilePath);

                    reject(originalTrackInfos.SNG_ID, warningMessage);
                });
            }

            function errorHandling(err) {
                if (404 === err.statusCode) {
                    err = 'Track "' + id + '" not found';
                    reject(err.statusCode)
                }

                if (err.name && err.message) {
                    if ('-' !== err.message) {
                        if ('songAlreadyExists' === err.name) {
                            that.downloadStateInstance.success(originalTrackInfos.SNG_ID, err.message);
                            resolve({msg: err.message})
                        } else {
                            reject(originalTrackInfos.SNG_ID, err.message);
                        }
                    }
                } else {
                    err.message ? reject(err.message) : reject(err);
                }

                if ('notAvailableButAlternative' !== err.name && 'invalidApiToken' !== err.name) {
                    resolve({msg: err.message});
                }
            }
        });
    }

    /**
     * Get track infos of a song by id.
     *
     * @param {Number} id
     */
    getTrackInfos(id) {
        return new Promise((resolve, reject) => {
            return this.requestWithCache({
                method: 'POST',
                url: unofficialApiUrl,
                qs: Object.assign(this.unofficialApiQueries, {
                    method: 'deezer.pageTrack',
                    cid: this.getApiCid()
                }),
                body: {
                    sng_id: id
                },
                json: true,
                jar: true
            }).then((response) => {
                if (response && 0 === Object.keys(response.error).length && response.results && response.results.DATA) {
                    let trackInfos = response.results.DATA;

                    if (response.results.LYRICS) {
                        trackInfos.LYRICS = response.results.LYRICS;
                    }
                    resolve(trackInfos);
                } else if (response.error.VALID_TOKEN_REQUIRED) {
                    this.initDeezerApi();

                    setTimeout(() => {
                        this.getTrackInfos(id).then((trackInfos) => {
                            resolve(trackInfos);
                        }).catch((err) => {
                            reject(err);
                        });
                    }, 1000);
                } else {
                    reject({statusCode: 404});
                }
            }).catch(() => {
                reject({statusCode: 404});
            });
        });
    }

    /**
     * Get a downloadable track quality.
     *
     * FLAC -> 320kbps -> 128kbps
     * 320kbps -> FLAC -> 128kbps
     * 128kbps -> 320kbps -> FLAC
     *
     * @param {Object} trackInfos
     *
     * @returns {Object|Boolean}
     */
    getValidTrackQuality(trackInfos) {
        if (trackInfos.FILESIZE_MP3_MISC === 0) {
            return musicQualities.MP3_MISC;
        }

        if (musicQualities.FLAC === selectedMusicQuality) {
            if (trackInfos.FILESIZE_FLAC === 0) {
                if (trackInfos.FILESIZE_MP3_320 === 0) {
                    if (trackInfos.FILESIZE_MP3_128 === 0) {
                        return false;
                    }
                    return musicQualities.MP3_128;
                }
                return musicQualities.MP3_320;
            }
            return musicQualities.FLAC;
        }

        if (musicQualities.MP3_320 === selectedMusicQuality) {
            if (trackInfos.FILESIZE_MP3_320 === 0) {
                if (trackInfos.FILESIZE_FLAC === 0 ) {
                    if (trackInfos.FILESIZE_MP3_128 === 0) {
                        return false;
                    }
                    return musicQualities.MP3_128;
                }
                return musicQualities.FLAC;
            }
            return musicQualities.MP3_320;
        }

        if (musicQualities.MP3_128 === selectedMusicQuality) {
            if (trackInfos.FILESIZE_MP3_128 === 0) {
                if (trackInfos.FILESIZE_MP3_320 === 0) {
                    if (trackInfos.FILESIZE_FLAC === 0) {
                        return false;
                    }
                    return musicQualities.FLAC;
                }
                return musicQualities.MP3_320;
            }
            return musicQualities.MP3_128;
        }

        return false;
    }

    /**
     * Get infos of an album by id.
     *
     * @param {Number} id
     */
    getAlbumInfos(id) {
        return new Promise((resolve, reject) => {
            return this.requestWithCache({
                method: 'POST',
                url: unofficialApiUrl,
                qs: Object.assign(this.unofficialApiQueries, {
                    method: 'deezer.pageAlbum',
                    cid: this.getApiCid()
                }),
                body: {
                    alb_id: id,
                    lang: 'us',
                    tab: 0
                },
                json: true,
                jar: true
            }).then((response) => {

                if (response && 0 === Object.keys(response.error).length && response.results && response.results.DATA && response.results.SONGS) {
                    let albumInfos = response.results.DATA;
                    albumInfos.SONGS = response.results.SONGS;

                    resolve(albumInfos);
                } else if (response.error.VALID_TOKEN_REQUIRED) {
                    this.initDeezerApi();

                    setTimeout(() => {
                        this.getAlbumInfos(id).then((albumInfos) => {
                            resolve(albumInfos);
                        }).catch((err) => {
                            reject(err);
                        });
                    }, 1000);
                } else {
                    reject({statusCode: 404});
                }
            }).catch(() => {
                reject({statusCode: 404});
            });
        });
    }

    /**
     * Get infos of an album from the official api by id.
     *
     * @param {Number} id
     */
    getAlbumInfosOfficialApi(id) {
        return new Promise((resolve, reject) => {
            return this.requestWithCache({
                url: 'https://api.deezer.com/album/' + id,
                json: true
            }).then((albumInfos) => {

                if (albumInfos && !albumInfos.error) {
                    resolve(albumInfos);
                } else {
                    reject({statusCode: 404});
                }
            }).catch(() => {
                reject({statusCode: 404});
            });
        });
    }

    /**
     * Replaces multiple whitespaces with a single one.
     *
     * @param {String} string
     * @returns {String}
     */
    multipleWhitespacesToSingle(string) {
        return string.replace(/[ _,]+/g, ' ');
    }

    /**
     * Replaces multiple whitespaces with a single one.
     *
     * @param {String} fileName
     * @returns {String}
     */
    sanitizeFilename(fileName) {
        fileName = fileName.replace('/', '-');

        return sanitize(fileName);
    }

    /**
     * Download the track, decrypt it and write it to a file.
     *
     * @param {Object} trackInfos
     * @param {Number} trackQualityId
     * @param {String} saveFilePath
     * @param {Number} numberRetry
     */
    downloadTrack(trackInfos, trackQualityId, saveFilePath, numberRetry = 0) {
        return new Promise((resolve, reject) => {
            const trackDownloadUrl = this.getTrackDownloadUrl(trackInfos, trackQualityId);

            this.requestWithoutCache({
                url: trackDownloadUrl,
                headers: this.httpHeaders,
                jar: true,
                encoding: null
            }).then((response) => {

                const decryptedTrackBuffer = encryptionService.decryptTrack(response, trackInfos);

                resolve(decryptedTrackBuffer);
            }).catch((err) => {
                if (403 === err.statusCode) {
                    let maxNumberRetry = 1;

                    if ((trackInfos.RIGHTS && 0 !== Object.keys(trackInfos.RIGHTS).length) || (trackInfos.AVAILABLE_COUNTRIES && trackInfos.AVAILABLE_COUNTRIES.STREAM_ADS && 0 < trackInfos.AVAILABLE_COUNTRIES.STREAM_ADS.length)) {
                        maxNumberRetry = 2;
                    }

                    if (maxNumberRetry >= numberRetry) {
                        numberRetry += 1;

                        setTimeout(() => {
                            this.downloadTrack(trackInfos, trackQualityId, saveFilePath, numberRetry).then((decryptedTrackBuffer) => {
                                resolve(decryptedTrackBuffer);
                            }).catch((error) => {
                                reject(error);
                            });
                        }, 1000);
                    } else {
                        reject(err);
                    }
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Calculate the URL to download the track.
     *
     * @param {Object} trackInfos
     * @param {Number} trackQuality
     *
     * @returns {String}
     */
    getTrackDownloadUrl(trackInfos, trackQuality) {
        const cdn = trackInfos.MD5_ORIGIN[0];

        return 'https://e-cdns-proxy-' + cdn + '.dzcdn.net/mobile/1/' + encryptionService.getSongFileName(trackInfos, trackQuality);
    }

    /**
     * Get alternative track for a song by its track infos.
     *
     * @param {Object} trackInfos
     */
    getTrackAlternative(trackInfos) {
        return new Promise((resolve, reject) => {
            return this.requestWithCache({
                method: 'POST',
                url: unofficialApiUrl,
                qs: Object.assign(this.unofficialApiQueries, {
                    method: 'search.music',
                    cid: this.getApiCid()
                }),
                body: {
                    QUERY: 'artist:\'' + trackInfos.ART_NAME + '\' track:\'' + trackInfos.SNG_TITLE + '\'',
                    OUTPUT: 'TRACK',
                    NB: 50,
                    FILTER: 0
                },
                json: true,
                jar: true
            }).then((response) => {
                if (response && 0 === Object.keys(response.error).length && response.results && response.results.data && 0 > response.results.data.length) {
                    const foundTracks = response.results.data;
                    let matchingTracks = [];
                    if (foundTracks.length > 0) {
                        foundTracks.forEach((foundTrack) => {
                            if (trackInfos.MD5_ORIGIN === foundTrack.MD5_ORIGIN && trackInfos.DURATION - 5 <= foundTrack.DURATION && trackInfos.DURATION + 10 >= foundTrack.DURATION) {
                                matchingTracks.push(foundTrack);
                            }
                        });

                        if (1 === matchingTracks.length) {
                            resolve(matchingTracks[0]);
                        } else {
                            let foundAlternativeTrack = false;

                            if (0 === matchingTracks.length) {
                                foundTracks.forEach((foundTrack) => {
                                    if (trackInfos.MD5_ORIGIN === foundTrack.MD5_ORIGIN) {
                                        matchingTracks.push(foundTrack);
                                    }
                                });
                            }

                            matchingTracks.forEach((foundTrack) => {
                                foundTrack.SNG_TITLE_VERSION = foundTrack.SNG_TITLE;

                                if (foundTrack.VERSION) {
                                    foundTrack.SNG_TITLE_VERSION = (foundTrack.SNG_TITLE + ' ' + foundTrack.VERSION).trim();
                                }

                                if (this.removeWhitespacesAndSpecialChars(trackInfos.SNG_TITLE_VERSION).toLowerCase() === this.removeWhitespacesAndSpecialChars(foundTrack.SNG_TITLE_VERSION).toLowerCase()) {
                                    foundAlternativeTrack = true;

                                    resolve(foundTrack);
                                }
                            });

                            if (!foundAlternativeTrack) {
                                reject("Did not find alternative track");
                            }
                        }
                    } else {
                        reject("Found no alternative tracks");
                    }
                } else if (response.error.VALID_TOKEN_REQUIRED) {
                    this.initDeezerApi();

                    setTimeout(() => {
                        this.getTrackAlternative(trackInfos).then((alternativeTrackInfos) => {
                            resolve(alternativeTrackInfos);
                        }).catch(() => {
                            reject("Error");
                        });
                    }, 1000);
                } else {
                    reject("error 2");
                }
            }).catch(() => {
                reject("Did not receive response");
            });
        });
    }
    
    /**
     * Capitalizes the first letter of a string
     *
     * @param {String} string
     *
     * @returns {String}
     */
    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    /**
     * Remove whitespaces and special characters from the given string.
     *
     * @param {String} string
     */
    removeWhitespacesAndSpecialChars(string) {
        return string.replace(/[^A-Z0-9]/ig, '');
    }

    /**
     * Get lyrics of a track by id.
     *
     * @param {Number} id
     */
    getTrackLyrics(id) {
        return new Promise((resolve, reject) => {
            return requestWithCache({
                method: 'POST',
                url: unofficialApiUrl,
                qs: Object.assign(this.unofficialApiQueries, {
                    method: 'song.getLyrics',
                    cid: this.getApiCid()
                }),
                body: {
                    sng_id: id
                },
                json: true,
                jar: true
            }).then((response) => {

                if (response && 0 === Object.keys(response.error).length && response.results && response.results.LYRICS_ID) {
                    let trackLyrics = response.results;

                    resolve(trackLyrics);
                } else if (response.error.VALID_TOKEN_REQUIRED) {
                    this.initDeezerApi();

                    setTimeout(() => {
                        this.getTrackLyrics(id).then((trackLyrics) => {
                            resolve(trackLyrics);
                        }).catch((err) => {
                            reject(err);
                        });
                    }, 1000);
                } else {
                    reject({statusCode: 404});
                }
            }).catch(() => {
                reject({statusCode: 404});
            });
        });
    }

    /**
     * Download the album cover of a track.
     *
     * @param {Object} trackInfos
     * @param {String} saveFilePath
     * @param {Number} numberRetry
     */
    downloadAlbumCover(trackInfos, saveFilePath, numberRetry = 0) {

        const albumCoverUrl = 'https://e-cdns-images.dzcdn.net/images/cover/' + trackInfos.ALB_PICTURE + '/1400x1400-000000-94-0-0.jpg';
        const albumCoverSavePath = saveFilePath.substring(0,-3) + 'jpg';

        return new Promise((resolve, reject) => {
            // check to make sure there is a cover for this album
            if (!trackInfos.ALB_PICTURE) {
                reject();
            } else {
                if (!fs.existsSync(albumCoverSavePath)) {

                    this.requestWithoutCache({
                        url: albumCoverUrl,
                        headers: this.httpHeaders,
                        jar: true,
                        encoding: null
                    }).then((response) => {

                        this.ensureDir(albumCoverSavePath);
                        fs.writeFile(albumCoverSavePath, response, (err) => {
                            if (err) {
                                reject();
                            } else {
                                resolve(albumCoverSavePath);
                            }
                        });
                    }).catch((err) => {
                        if (403 === err.statusCode) {
                            if (4 >= numberRetry) {
                                numberRetry += 1;

                                setTimeout(() => {
                                    this.downloadAlbumCover(trackInfos, saveFilePath, numberRetry).then((albumCoverSavePath) => {
                                        resolve(albumCoverSavePath);
                                    }).catch(() => {
                                        reject();
                                    });
                                }, 500);
                            } else {
                                reject();
                            }
                        } else {
                            reject();
                        }
                    });
                } else {
                    resolve(albumCoverSavePath);
                }
            }
        });
    }

    /**
     * Add tags to the mp3/flac file.
     *
     * @param {Buffer} decryptedTrackBuffer
     * @param {Object} trackInfos
     * @param {String} saveFilePath
     * @param {Number} numberRetry
     */
    addTrackTags(decryptedTrackBuffer, trackInfos, saveFilePath, numberRetry = 0) {
        return new Promise((resolve, reject) => {
            let that = this;

            this.downloadAlbumCover(trackInfos, saveFilePath)
            .then((albumCoverSavePath) => {
                startTagging(albumCoverSavePath);
            }).catch(() => {
                startTagging();
            });

            function startTagging(albumCoverSavePath = null) {
                try {
                    // I want tha best lyrics!
                    if (trackInfos.LYRICS || !trackInfos.LYRICS_ID || 0 === trackInfos.LYRICS_ID) {
                        afterLyricsFetching();
                    } else {
                        that.getTrackLyrics(trackInfos.SNG_ID).then((trackLyrics) => {
                            trackInfos.LYRICS = trackLyrics;

                            afterLyricsFetching();
                        }).catch(() => {
                            afterLyricsFetching();
                        });
                    }

                    afterLyricsFetching();

                    function afterLyricsFetching() {
                        let trackMetadata = {
                            title: '',
                            album: '',
                            releaseType: '',
                            genre: '',
                            artists: [],
                            albumArtist: '',
                            trackNumber: '',
                            trackNumberCombined: '',
                            partOfSet: '',
                            partOfSetCombined: '',
                            label: '',
                            copyright: '',
                            composer: [],
                            publisher: [],
                            producer: [],
                            engineer: [],
                            writer: [],
                            author: [],
                            mixer: [],
                            ISRC: '',
                            duration: '',
                            bpm: '',
                            upc: '',
                            explicit: '',
                            tracktotal: '',
                            disctotal: '',
                            compilation: '',
                            unsynchronisedLyrics: '',
                            synchronisedLyrics: '',
                            media: 'Digital Media',
                        };

                        if (trackInfos.SNG_TITLE_VERSION) {
                            trackMetadata.title = trackInfos.SNG_TITLE_VERSION;
                        }

                        if (trackInfos.ALB_TITLE) {
                            trackMetadata.album = trackInfos.ALB_TITLE;
                        }

                        if (trackInfos.ALB_ART_NAME) {
                            trackMetadata.albumArtist = trackInfos.ALB_ART_NAME;
                        }

                        if (trackInfos.DURATION) {
                            trackMetadata.duration = trackInfos.DURATION;
                        }

                        if (trackInfos.ALB_UPC) {
                            trackMetadata.upc = trackInfos.ALB_UPC;
                        }

                        if (trackInfos.ALB_RELEASE_TYPE) {
                            let releaseType = trackInfos.ALB_RELEASE_TYPE;

                            if ('ep' === releaseType) {
                                releaseType = 'EP';
                            } else {
                                releaseType = that.capitalizeFirstLetter(releaseType);
                            }

                            trackMetadata.releaseType = releaseType;
                        }

                        if (trackInfos.ALB_GENRES && trackInfos.ALB_GENRES[0]) {
                            trackMetadata.genre = trackInfos.ALB_GENRES[0];
                        }

                        if (trackInfos.TRACK_NUMBER) {
                            trackMetadata.trackNumber = trackInfos.TRACK_NUMBER;
                            trackMetadata.trackNumberCombined = trackInfos.TRACK_NUMBER;
                        }

                        if (trackInfos.ALB_NUM_TRACKS) {
                            trackMetadata.tracktotal = trackInfos.ALB_NUM_TRACKS;
                            trackMetadata.trackNumberCombined += '/' + trackInfos.ALB_NUM_TRACKS;
                        }

                        if (trackInfos.DISK_NUMBER) {
                            trackMetadata.partOfSet = trackInfos.DISK_NUMBER;
                            trackMetadata.partOfSetCombined = trackInfos.DISK_NUMBER;
                        }

                        if (trackInfos.ALB_NUM_DISCS) {
                            trackMetadata.disctotal = trackInfos.ALB_NUM_DISCS;
                            trackMetadata.partOfSetCombined += '/' + trackInfos.ALB_NUM_DISCS;
                        }

                        if (trackInfos.ALB_RELEASE_DATE || trackInfos.PHYSICAL_RELEASE_DATE) {
                            let releaseDate = trackInfos.ALB_RELEASE_DATE;

                            if (!trackInfos.ALB_RELEASE_DATE) {
                                releaseDate = trackInfos.PHYSICAL_RELEASE_DATE;
                            }

                            trackMetadata.releaseYear = releaseDate.slice(0, 4);
                            trackMetadata.releaseDate = releaseDate.slice(0, 10);
                        }

                        if (trackInfos.ALB_LABEL) {
                            trackMetadata.label = trackInfos.ALB_LABEL;
                        }

                        if (trackInfos.COPYRIGHT) {
                            trackMetadata.copyright = trackInfos.COPYRIGHT;
                        }

                        if (trackInfos.ISRC) {
                            trackMetadata.ISRC = trackInfos.ISRC;
                        }

                        if (trackInfos.BPM) {
                            trackMetadata.bpm = trackInfos.BPM;
                        }

                        if (trackInfos.EXPLICIT_LYRICS) {
                            trackMetadata.explicit = trackInfos.EXPLICIT_LYRICS;
                        }

                        if (trackInfos.ARTISTS) {
                            let trackArtists = [];

                            trackInfos.ARTISTS.forEach((trackArtist) => {
                                if (trackArtist.ART_NAME) {
                                    trackArtist = trackArtist.ART_NAME.split(new RegExp(' featuring | feat. | Ft. | ft. | vs | vs. | x | - |, ', 'g'));
                                    trackArtist = trackArtist.map(Function.prototype.call, String.prototype.trim);

                                    trackArtists = trackArtists.concat(trackArtist);
                                }
                            });

                            trackArtists = [...new Set(trackArtists)];
                            trackMetadata.artists = trackArtists;
                        }

                        if (trackInfos.SNG_CONTRIBUTORS) {
                            if (trackInfos.SNG_CONTRIBUTORS.composer) {
                                trackMetadata.composer = trackInfos.SNG_CONTRIBUTORS.composer;
                            }

                            if (trackInfos.SNG_CONTRIBUTORS.musicpublisher) {
                                trackMetadata.publisher = trackInfos.SNG_CONTRIBUTORS.musicpublisher;
                            }

                            if (trackInfos.SNG_CONTRIBUTORS.producer) {
                                trackMetadata.producer = trackInfos.SNG_CONTRIBUTORS.producer;
                            }

                            if (trackInfos.SNG_CONTRIBUTORS.engineer) {
                                trackMetadata.engineer = trackInfos.SNG_CONTRIBUTORS.engineer;
                            }

                            if (trackInfos.SNG_CONTRIBUTORS.writer) {
                                trackMetadata.writer = trackInfos.SNG_CONTRIBUTORS.writer;
                            }

                            if (trackInfos.SNG_CONTRIBUTORS.author) {
                                trackMetadata.author = trackInfos.SNG_CONTRIBUTORS.author;
                            }

                            if (trackInfos.SNG_CONTRIBUTORS.mixer) {
                                trackMetadata.mixer = trackInfos.SNG_CONTRIBUTORS.mixer;
                            }
                        }

                        if ('Various Artists' === trackMetadata.performerInfo) {
                            trackMetadata.compilation = 1;
                        } else {
                            trackMetadata.compilation = 0;
                        }

                        //lyrics are allowed to be added to the metadata
                        if (trackInfos.LYRICS) {
                            if (trackInfos.LYRICS.LYRICS_TEXT) {
                                trackMetadata.unsynchronisedLyrics = trackInfos.LYRICS.LYRICS_TEXT;
                            }

                            if (trackInfos.LYRICS.LYRICS_SYNC_JSON) {
                                const syncedLyrics = trackInfos.LYRICS.LYRICS_SYNC_JSON;

                                for (let i = 0; i < syncedLyrics.length; i++) {
                                    if (syncedLyrics[i].lrc_timestamp) {
                                        trackMetadata.synchronisedLyrics += syncedLyrics[i].lrc_timestamp + syncedLyrics[i].line + '\r\n';
                                    } else if (i + 1 < syncedLyrics.length) {
                                        trackMetadata.synchronisedLyrics += syncedLyrics[i + 1].lrc_timestamp + syncedLyrics[i].line + '\r\n';
                                    }
                                }
                            }
                        }

                        let saveFilePathExtension = nodePath.extname(saveFilePath);

                        if ('.mp3' === saveFilePathExtension) {
                            //screw those lyrics files
                            /*if ('' !== trackMetadata.synchronisedLyrics.trim()) {
                                const lyricsFile = saveFilePath.slice(0, -4) + '.lrc';

                                that.ensureDir(lyricsFile);
                                fs.writeFileSync(lyricsFile, trackMetadata.synchronisedLyrics);
                            }*/

                            const writer = new id3Writer(decryptedTrackBuffer);
                            let coverBuffer;

                            if (albumCoverSavePath && fs.existsSync(albumCoverSavePath)) {
                                coverBuffer = fs.readFileSync(albumCoverSavePath);
                            }

                            writer
                                .setFrame('TIT2', trackMetadata.title)
                                .setFrame('TALB', trackMetadata.album)
                                .setFrame('TCON', [trackMetadata.genre])
                                .setFrame('TPE2', trackMetadata.albumArtist)
                                .setFrame('TPE1', [trackMetadata.artists.join(', ')])
                                .setFrame('TRCK', trackMetadata.trackNumberCombined)
                                .setFrame('TPOS', trackMetadata.partOfSetCombined)
                                .setFrame('TCOP', trackMetadata.copyright)
                                .setFrame('TPUB', trackMetadata.publisher.join('/'))
                                .setFrame('TMED', trackMetadata.media)
                                .setFrame('TCOM', trackMetadata.composer)
                                .setFrame('TXXX', {
                                    description: 'Artists',
                                    value: trackMetadata.artists.join('/')
                                })
                                .setFrame('TXXX', {
                                    description: 'RELEASETYPE',
                                    value: trackMetadata.releaseType
                                })
                                .setFrame('TXXX', {
                                    description: 'ISRC',
                                    value: trackMetadata.ISRC
                                })
                                .setFrame('TXXX', {
                                    description: 'BARCODE',
                                    value: trackMetadata.upc
                                })
                                .setFrame('TXXX', {
                                    description: 'LABEL',
                                    value: trackMetadata.label
                                })
                                .setFrame('TXXX', {
                                    description: 'LYRICIST',
                                    value: trackMetadata.writer.join('/')
                                })
                                .setFrame('TXXX', {
                                    description: 'MIXARTIST',
                                    value: trackMetadata.mixer.join('/')
                                })
                                .setFrame('TXXX', {
                                    description: 'INVOLVEDPEOPLE',
                                    value: trackMetadata.producer.concat(trackMetadata.engineer).join('/')
                                })
                                .setFrame('TXXX', {
                                    description: 'COMPILATION',
                                    value: trackMetadata.compilation
                                })
                                .setFrame('TXXX', {
                                    description: 'EXPLICIT',
                                    value: trackMetadata.explicit
                                })
                                .setFrame('TXXX', {
                                    description: 'SOURCE',
                                    value: 'Deezer'
                                })
                                .setFrame('TXXX', {
                                    description: 'SOURCEID',
                                    value: trackInfos.SNG_ID
                                });

                            if ('' !== trackMetadata.unsynchronisedLyrics) {
                                writer.setFrame('USLT', {
                                    description: '',
                                    lyrics: trackMetadata.unsynchronisedLyrics
                                });
                            }

                            if (coverBuffer) {
                                writer.setFrame('APIC', {
                                    type: 3,
                                    data: coverBuffer,
                                    description: ''
                                });
                            }

                            if (0 < parseInt(trackMetadata.releaseYear)) {
                                writer.setFrame('TYER', trackMetadata.releaseYear);
                            }

                            if (0 < parseInt(trackMetadata.releaseDate)) {
                                writer.setFrame('TDAT', trackMetadata.releaseDate);
                            }

                            if (0 < parseInt(trackMetadata.bpm)) {
                                writer.setFrame('TBPM', trackMetadata.bpm);
                            }

                            writer.addTag();

                            const taggedTrackBuffer = Buffer.from(writer.arrayBuffer);

                            that.ensureDir(saveFilePath);
                            fs.writeFileSync(saveFilePath, taggedTrackBuffer);

                            resolve();
                        } else if ('.flac' === saveFilePathExtension) {
                            if ('' !== trackMetadata.synchronisedLyrics.trim()) {
                                const lyricsFile = saveFilePath.slice(0, -5) + '.lrc';

                                that.ensureDir(lyricsFile);
                                fs.writeFileSync(lyricsFile, trackMetadata.synchronisedLyrics);
                            }

                            let flacComments = [
                                'SOURCE=Deezer',
                                'SOURCEID=' + trackInfos.SNG_ID
                            ];

                            if ('' !== trackMetadata.title) {
                                flacComments.push('TITLE=' + trackMetadata.title);
                            }

                            if ('' !== trackMetadata.album) {
                                flacComments.push('ALBUM=' + trackMetadata.album);
                            }

                            if ('' !== trackMetadata.genre) {
                                flacComments.push('GENRE=' + trackMetadata.genre);
                            }

                            if ('' !== trackMetadata.albumArtist) {
                                flacComments.push('ALBUMARTIST=' + trackMetadata.albumArtist);
                            }

                            if (0 < trackMetadata.artists.length) {
                                flacComments.push('ARTIST=' + trackMetadata.artists.join(', '));
                            }

                            if ('' !== trackMetadata.trackNumber) {
                                flacComments.push('TRACKNUMBER=' + trackMetadata.trackNumber);
                            }

                            if ('' !== trackMetadata.tracktotal) {
                                flacComments.push('TRACKTOTAL=' + trackMetadata.tracktotal);
                                flacComments.push('TOTALTRACKS=' + trackMetadata.tracktotal);
                            }

                            if ('' !== trackMetadata.partOfSet) {
                                flacComments.push('DISCNUMBER=' + trackMetadata.partOfSet);
                            }

                            if ('' !== trackMetadata.disctotal) {
                                flacComments.push('DISCTOTAL=' + trackMetadata.disctotal);
                                flacComments.push('TOTALDISCS=' + trackMetadata.disctotal);
                            }

                            if ('' !== trackMetadata.label) {
                                flacComments.push('LABEL=' + trackMetadata.label);
                            }

                            if ('' !== trackMetadata.copyright) {
                                flacComments.push('COPYRIGHT=' + trackMetadata.copyright);
                            }

                            if ('' !== trackMetadata.duration) {
                                flacComments.push('LENGTH=' + trackMetadata.duration);
                            }

                            if ('' !== trackMetadata.ISRC) {
                                flacComments.push('ISRC=' + trackMetadata.ISRC);
                            }

                            if ('' !== trackMetadata.upc) {
                                flacComments.push('BARCODE=' + trackMetadata.upc);
                            }

                            if ('' !== trackMetadata.media) {
                                flacComments.push('MEDIA=' + trackMetadata.media);
                            }

                            if ('' !== trackMetadata.compilation) {
                                flacComments.push('COMPILATION=' + trackMetadata.compilation);
                            }

                            if ('' !== trackMetadata.explicit) {
                                flacComments.push('EXPLICIT=' + trackMetadata.explicit);
                            }

                            if (trackMetadata.releaseType) {
                                flacComments.push('RELEASETYPE=' + trackMetadata.releaseType);
                            }

                            trackMetadata.artists.forEach((artist) => {
                                flacComments.push('ARTISTS=' + artist);
                            });

                            trackMetadata.composer.forEach((composer) => {
                                flacComments.push('COMPOSER=' + composer);
                            });

                            trackMetadata.publisher.forEach((publisher) => {
                                flacComments.push('ORGANIZATION=' + publisher);
                            });

                            trackMetadata.producer.forEach((producer) => {
                                flacComments.push('PRODUCER=' + producer);
                            });

                            trackMetadata.engineer.forEach((engineer) => {
                                flacComments.push('ENGINEER=' + engineer);
                            });

                            trackMetadata.writer.forEach((writer) => {
                                flacComments.push('WRITER=' + writer);
                            });

                            trackMetadata.author.forEach((author) => {
                                flacComments.push('AUTHOR=' + author);
                            });

                            trackMetadata.mixer.forEach((mixer) => {
                                flacComments.push('MIXER=' + mixer);
                            });

                            if (trackMetadata.unsynchronisedLyrics) {
                                flacComments.push('LYRICS=' + trackMetadata.unsynchronisedLyrics);
                            }

                            if (0 < parseInt(trackMetadata.releaseYear)) {
                                flacComments.push('YEAR=' + trackMetadata.releaseYear);
                            }

                            if (0 < parseInt(trackMetadata.releaseDate)) {
                                flacComments.push('DATE=' + trackMetadata.releaseDate);
                            }

                            if (0 < parseInt(trackMetadata.bpm)) {
                                flacComments.push('BPM=' + trackMetadata.bpm);
                            }

                            const reader = new stream.PassThrough();
                            reader.end(decryptedTrackBuffer);

                            that.ensureDir(saveFilePath);

                            const writer = fs.createWriteStream(saveFilePath);
                            let processor = new flacMetadata.Processor({parseMetaDataBlocks: true});
                            let vendor = 'reference libFLAC 1.2.1 20070917';
                            let coverBuffer;

                            if (albumCoverSavePath && fs.existsSync(albumCoverSavePath)) {
                                coverBuffer = fs.readFileSync(albumCoverSavePath);
                            }

                            let mdbVorbisComment;
                            let mdbVorbisPicture;

                            processor.on('preprocess', (mdb) => {
                                // Remove existing VORBIS_COMMENT and PICTURE blocks, if any.
                                if (flacMetadata.Processor.MDB_TYPE_VORBIS_COMMENT === mdb.type) {
                                    mdb.remove();
                                } else if (coverBuffer && flacMetadata.Processor.MDB_TYPE_PICTURE === mdb.type) {
                                    mdb.remove();
                                }

                                if (mdb.isLast) {
                                    mdbVorbisComment = flacMetadata.data.MetaDataBlockVorbisComment.create(!coverBuffer, vendor, flacComments);

                                    if (coverBuffer) {
                                        mdbVorbisPicture = flacMetadata.data.MetaDataBlockPicture.create(true, 3, 'image/jpeg', '', 1400, 1400, 24, 0, coverBuffer);
                                    }

                                    mdb.isLast = false;
                                }
                            });

                            processor.on('postprocess', (mdb) => {
                                if (flacMetadata.Processor.MDB_TYPE_VORBIS_COMMENT === mdb.type && null !== mdb.vendor) {
                                    vendor = mdb.vendor;
                                }

                                if (mdbVorbisComment) {
                                    processor.push(mdbVorbisComment.publish());
                                }

                                if (mdbVorbisPicture) {
                                    processor.push(mdbVorbisPicture.publish());
                                }
                            });

                            reader.on('end', () => {
                                resolve();
                            });

                            reader.pipe(processor).pipe(writer);
                        }
                    }
                } catch (err) {

                    if (10 > numberRetry) {
                        numberRetry += 1;

                        setTimeout(() => {
                            that.addTrackTags(decryptedTrackBuffer, trackInfos, saveFilePath, numberRetry).then(() => {
                                resolve();
                            }).catch(() => {
                                reject();
                            });
                        }, 500);
                    } else {
                        this.ensureDir(saveFilePath);
                        fs.writeFileSync(saveFilePath, decryptedTrackBuffer);

                        reject();
                    }
                }
            }
        });
    }

}

let smloadr = new smloadrClass;
module.exports = smloadr;