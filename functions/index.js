const functions = require('firebase-functions');
const admin = require('firebase-admin');
const mkdirp = require('mkdirp-promise');
const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');

admin.initializeApp(functions.config().firebase);

exports.helloWorld = functions.https.onRequest((request, response) => {
    response.status(200).json({status: 200, message: "Hello from Dank Memes 😃!"});
});

/**
 * Function to update number of users
 */
exports.updateUserMetadata = functions.firestore.document('users/{id}').onCreate((snapshot, context) => {
    const updateTotal = admin.database().ref('metadata/users-count').once('value').then(snap => {
        let usersCount = snap.val();

        if (!usersCount) {
            return admin.database().ref('metadata/users-count').set(1);
        } else {
            usersCount += 1;
            return admin.database().ref('metadata/users-count').set(usersCount);
        }
    });

    const date = formatDate(new Date());
    const updateToday = admin.database().ref('metadata/joined-users/' + date).once('value').then(snap => {
        let joinedTodayCount = snap.val();

        if (!joinedTodayCount) {
            return admin.database().ref('metadata/joined-users/' + date).set(1);
        } else {
            joinedTodayCount += 1;
            return admin.database().ref('metadata/joined-users/' + date).set(joinedTodayCount);
        }
    });

    return Promise
        .all([updateTotal, updateToday])
        .catch(error => {
            console.log(`Error users metadata: ${error}`)
        });
});

/**
 * Function to update user content
 */
exports.updateUserContent = functions.firestore.document('users/{userId}').onUpdate((snapshot, context) => {
    const userExisted = snapshot.before.data();

    if (!userExisted) {
        return null;
    }

    const currentUser = snapshot.after.data();
    const userId = currentUser.userId;

    const previousName = userExisted.userName;
    const currentName = currentUser.userName;

    const previousAvatar = userExisted.userAvatar;
    const currentAvatar = currentUser.userAvatar;

    const wasMuted = userExisted.muted;
    const muted = currentUser.muted;

    let changedName = false;
    let changedAvatar = false;
    let changedMuteStatus = false;

    if (currentName !== previousName) {
        changedName = true;
    }

    if (currentAvatar !== previousAvatar) {
        changedAvatar = true;
    }

    if (muted !== wasMuted) {
        changedMuteStatus = true;
    }

    if (!changedName && !changedAvatar && !changedMuteStatus) {
        console.log("False alarm");
        return null;
    }

    function updateMeme(meme) {
        return admin.firestore().collection('memes').doc(meme.id)
            .update({memePoster: currentName, memePosterAvatar: currentAvatar});
    }

    function muteMeme(meme) {
        return admin.firestore().collection('memes').doc(meme.id)
            .update({muted: true});
    }

    function unmuteMeme(meme) {
        return admin.firestore().collection('memes').doc(meme.id)
            .update({muted: false});
    }

    function handleMemes(actionToHandle) {
        return admin.firestore().collection('memes')
            .where('memePosterID', '==', userId)
            .get()
            .then(snap => {
                let memes = [];
                snap.forEach(meme => {
                    memes.push(meme.data());
                });
                return memes;
            })
            .then(memes => {
                return memes.map(actionToHandle);
            })
            .then(memes => {
                return Promise.all(memes);
            });
    }

    function handleComments() {
        function updateComment(comment) {
            return admin.firestore().collection('comments').doc(comment.memeId)
                .collection('meme-comments').doc(comment.commentId)
                .update({userName: currentName, userAvatar: currentAvatar});
        }

        return admin.firestore().collectionGroup('meme-comments')
            .where('userId', '==', userId)
            .get()
            .then(snap => {
                let comments = [];
                snap.forEach(comment => {
                    comments.push(comment.data());
                });
                return comments;
            })
            .then(comments => {
                return comments.map(updateComment);
            })
            .then(comments => {
                return Promise.all(comments);
            })
            .then(() => {
                console.log(`Comments updated for: ${userId}`);
                return null;
            });
    }

    function handleNotifications() {
        function updateNotification(notification) {
            if (!notification.notifiedUserId) return null;

            return admin.firestore().collection('notifications').doc(notification.notifiedUserId)
                .collection('user-notifications').doc(notification.id)
                .update({username: currentName, userAvatar: currentAvatar});
        }

        return admin.firestore().collectionGroup('user-notifications')
            .where('userId', '==', userId)
            .get()
            .then(snap => {
                let notifications = [];
                snap.forEach(notification => {
                    notifications.push(notification.data());
                });
                return notifications;
            })
            .then(notifications => {
                return notifications.map(updateNotification);
            })
            .then(notifications => {
                return Promise.all(notifications);
            })
            .then(() => {
                console.log(`Notifications updated for: ${userId}`);
                return null;
            });
    }

    if ((!wasMuted || wasMuted === false) && muted === true) { // Mute memes
        return handleMemes(muteMeme)
            .then(() => {
                return console.log(`Memes muted for: ${userId}`);
            })
            .catch(error => {
                console.log(`Error muting memes: ${error}`)
            });
    } else if (wasMuted === true && muted === false) { // Unmute memes
        return handleMemes(unmuteMeme)
            .then(() => {
                return console.log(`Memes unmuted for: ${userId}`);
            })
            .catch(error => {
                console.log(`Error unmuting memes: ${error}`);
            });
    } else { // Update memes details
        return Promise
            .all([handleComments(), handleMemes(updateMeme), handleNotifications()])
            .then(() => {
                return console.log(`Memes updated for: ${userId}`)
            })
            .catch(error => {
                console.log(`Error updating user content: ${error}`)
            });
    }
});

/**
 *  Function to generate image thumbnails
 */
exports.generateThumbnail = functions.storage.object().onFinalize((object) => {
    const THUMB_PREFIX = 'thumb_';

    const filePath = object.name;
    const contentType = object.contentType; // This is the image MIME type
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath);
    const thumbFilePath = path.normalize(path.join(fileDir, `${THUMB_PREFIX}${fileName}`));
    const tempLocalFile = path.join(os.tmpdir(), filePath);
    const tempLocalDir = path.dirname(tempLocalFile);
    const tempLocalThumbFile = path.join(os.tmpdir(), thumbFilePath);
    const tempLocalFileName = path.join(os.tmpdir(), thumbFilePath);

    // Exit if this is triggered on a file that is not an image.
    if (!contentType.startsWith('image/')) {
        console.log('This is not an image.');
        return null;
    }

    // Exit if the image is already a thumbnail.
    if (fileName.startsWith(THUMB_PREFIX)) {
        console.log('Already a Thumbnail.');
        return null;
    }

    // Cloud Storage files.
    const bucket = admin.storage().bucket(object.bucket);
    const file = bucket.file(filePath);
    const thumbFile = bucket.file(thumbFilePath);
    const metadata = {
        contentType: contentType,
    };

    // Create the temp directory where the storage file will be downloaded.
    return mkdirp(tempLocalDir)
        .then(() => {
            // Download file from bucket.
            return file.download({destination: tempLocalFile});
        })
        .then(() => {
            //console.log('The file has been downloaded to', tempLocalFile);
            // Generate a thumbnail using ImageMagick.
            return spawn('convert', [tempLocalFile, '-thumbnail', `>`, tempLocalThumbFile], {capture: ['stdout', 'stderr']});
        })
        .then(() => {
            //console.log('The thumbnail has been generated at', tempLocalThumbFile);
            return spawn('convert', [tempLocalThumbFile, '-channel', 'RGBA', '-blur', '0x8', tempLocalFileName])
        })
        .then(() => {
            //console.log('Thumbnail created at', tempLocalFileName);
            // Uploading the Thumbnail.
            return bucket.upload(tempLocalFileName, {destination: thumbFilePath, metadata: metadata});
        })
        .then(() => {
            //console.log('Thumbnail uploaded to Storage at', thumbFilePath);
            // Once the image has been uploaded delete the local files to free up disk space.
            fs.unlinkSync(tempLocalFile);
            fs.unlinkSync(tempLocalThumbFile);
            // Get the Signed URLs for the thumbnail and original image.
            const config = {
                action: 'read',
                expires: '03-01-2500',
            };

            return Promise.all([
                thumbFile.getSignedUrl(config),
                file.getSignedUrl(config),
            ]);
        })
        .then((results) => {
            //console.log('Got Signed URLs.');
            const thumbResult = results[0];
            const originalResult = results[1];
            const thumbFileUrl = thumbResult[0];
            const fileUrl = originalResult[0];
            // Add the URLs to the Database
            // return admin.database().ref('dank-memes/'+fileName+'/thumbnail').set(thumbFileUrl);
            return admin.firestore().collection("memes").doc(fileName).update({thumbnail: thumbFileUrl});
        })
        .then(() => console.log('Thumbnail URLs saved to database.'))
        .catch(error => console.log(`Error saving thumbnail: ${error}`));
});

/**
 * Function to check added meme counts
 * If count is <20, count is incremented
 * If count ==20, notification is sent to all users then count is reset
 */
exports.handleNewMemePosted = functions.firestore.document('memes/{id}').onCreate((snapshot, context) => {
    const titles = ["Dank Memes alert!", "Having a busy day?", "Hey there!", "Pssst!...", "Having a boring day?",
        "You hear that?...", "Somebody call 911?", "Catching a break?", "Heyy there 😃😃😃"];

    const bodies = ["Check out these fresh memes 😜", "Catch a break with these fresh memes", "Have you seen these fresh memes yet?",
        "I've got some fresh memes you ain't seen yet 😜😜", "Worry not. Here's some fresh memes 😜",
        "It's memes o'clock!! Check out these fire memes", "We've got you fam. Check out these dank memes 😜😜",
        "Coz it's lit up in here.. check out these memes 😜", "Heard you like memes. Want some? 😜"];

    const notifIndex = Math.floor(Math.random() * titles.length);

    const checkNotifCount = admin.database().ref('metadata/notif-count')
        .once('value')
        .then(snap => {
            let currentCount = snap.val();
            let sendNotif = false;

            if (!currentCount) {
                currentCount = 1;
            } else if (currentCount < 20) {
                currentCount += 1;
            } else {
                sendNotif = true;
                currentCount = 0;
            }

            let sendNotification = null;
            if (sendNotif) {
                const payload = {
                    notification: {
                        title: titles[notifIndex],
                        body: bodies[notifIndex]
                    }
                };

                sendNotification = admin.messaging().sendToTopic("memes", payload);
            }

            const updateCount = admin.database().ref('metadata/notif-count').set(currentCount);
            return Promise.all([updateCount, sendNotification]);
        });

    const totalCount = admin.database().ref('metadata/memes-count')
        .once('value')
        .then(snap => {
            let memeCount = snap.val();

            if (!memeCount) {
                return admin.database().ref('metadata/memes-count').set(1);
            } else {
                memeCount += 1;
                return admin.database().ref('metadata/memes-count').set(memeCount);
            }
        });

    const meme = snapshot.data();
    const userMemesData = admin.firestore().collection('users').doc(meme.memePosterID)
        .get()
        .then(snap => {
            const user = snap.data();
            let postsCount;
            if (!user.posts) {
                postsCount = 1;
            } else {
                postsCount = user.posts + 1;
            }

            const userMemesCount = admin.firestore().collection('users').doc(user.userId)
                .update({posts: postsCount});

            if (user.muted === true) {
                const setMemeMuted = admin.firestore().collection('memes').doc(meme.id)
                    .update({muted: true});
                return Promise.all([userMemesCount, setMemeMuted])
            } else {
                return userMemesCount;
            }
        });

    return Promise
        .all([checkNotifCount, totalCount, userMemesData])
        .catch(error => {
            console.log(`Error on memeUploaded: ${error}`)
        });
});

/**
 *  Function to send like notification
 */
exports.handleMemeLikeNotification = functions.firestore.document('memes/{id}').onUpdate((snapshot, context) => {
    const before = snapshot.before.data();
    const after = snapshot.after.data();
    const memePosterId = after.memePosterID;

    const previousLikes = before.likes;
    const currentLikes = after.likes;

    const previousLikesCount = Object.keys(previousLikes).length;
    const currentLikesCount = Object.keys(currentLikes).length;

    if (previousLikesCount === currentLikesCount || previousLikesCount > currentLikesCount) {
        console.log("False alarm");
        return null;
    }

    let likerId;

    for (let key in currentLikes) {
        if (!(key in previousLikes)) {
            likerId = key;
        }
    }

    if (likerId === memePosterId) {
        return null;
    }

    const memePoster = admin.firestore().collection('users').doc(memePosterId)
        .get()
        .then(userSnap => {
            const user = userSnap.data();
            return user.userToken;
        });

    const memeLiker = admin.firestore().collection('users').doc(likerId)
        .get()
        .then(userSnap => {
            return userSnap.data();
        });

    let sendNotification = function (userToken, likerName) {
        const payload = {
            notification: {
                title: "New Like",
                body: likerName + " liked your post"
            }
        };
        return admin.messaging().sendToDevice(userToken, payload)
    };

    let saveNotification = function (likerName, likerAvatar) {
        return admin.firestore().collection("notifications")
            .doc()
            .get()
            .then(notifRef => {
                const notifId = notifRef.id;

                return {
                    id: notifId,
                    userId: likerId,
                    username: likerName,
                    userAvatar: likerAvatar,
                    type: 0,
                    title: "",
                    description: "",
                    imageUrl: after.imageUrl,
                    time: new Date().getTime(),
                    memeId: after.id,
                    notifiedUserId: memePosterId
                };
            })
            .then(notification => {
                return admin.firestore()
                    .collection('notifications')
                    .doc(memePosterId)
                    .collection('user-notifications')
                    .doc(notification.id)
                    .set(notification);
            });
    };

    return Promise.all([memePoster, memeLiker])
        .then((results) => {
            const memePosterToken = results[0];
            const memeLiker = results[1];

            return Promise
                .all([
                    sendNotification(memePosterToken, memeLiker.userName),
                    saveNotification(memeLiker.userName, memeLiker.userAvatar)
                ])
        })
        .catch(error => {
            console.log(`Error handling like notification: ${error}`)
        });

});

/**
 * Function to send comment notification
 */
exports.handleCommentNotification = functions.firestore.document('comments/{memeId}/meme-comments/{commentId}').onCreate((snapshot, context) => {
    const comment = snapshot.data();
    const id = comment.memeId;
    const otherCommenters = new Set();

    const sendNotification = function (userId) {
        if (comment.userId === userId) return console.log("Can't send yourself your own comment, idiot");

        return admin.firestore().collection('users').doc(userId)
            .get()
            .then(userSnap => {
                const user = userSnap.data();

                const payload = {
                    notification: {
                        title: "New comment",
                        body: comment.userName + " commented: \"" + comment.comment + "\""
                    }
                };

                return admin.messaging().sendToDevice(user.userToken, payload)
            });
    };

    const saveNotification = function (meme, userId) {
        if (comment.userId === userId) return console.log("Can't save your own comment, idiot");

        return admin.firestore().collection("notifications")
            .doc()
            .get()
            .then(notifRef => {
                const notifId = notifRef.id;

                return {
                    id: notifId,
                    userId: comment.userId,
                    username: comment.userName,
                    userAvatar: comment.userAvatar,
                    type: 1,
                    title: "",
                    description: comment.comment,
                    imageUrl: meme.imageUrl,
                    time: new Date().getTime(),
                    memeId: comment.memeId,
                    notifiedUserId: userId
                };
            })
            .then(notification => {
                return admin.firestore()
                    .collection('notifications')
                    .doc(userId)
                    .collection('user-notifications')
                    .doc(notification.id)
                    .set(notification);
            });
    };

    /**
     * Send notification to other commenters
     * @param meme
     */
    function handleOtherComments(meme) {
        return admin.firestore().collection('comments').doc(meme.id).collection('meme-comments')
            .get()
            .then(snap => {
                let comments = [];
                snap.forEach(s => {
                    comments.push(s.data())
                });
                return comments;
            })
            .then(comments => {
                return comments
                    .filter(c => c.userId !== meme.memePosterID)
            })
            .then(comments => {
                comments.forEach(c => otherCommenters.add(c.userId));
                return Array.from(otherCommenters).filter(c =>  c !== comment.userId)
            })
            .then(others => {
                return Promise.all([others.map(user => saveNotification(meme, user)), others.map(sendNotification)]);
            })
            .then(() => {
                return console.log("All comments for others sent");
            })
            .catch(error => {
                console.log(`Error sending notifications to other users: ${error}`)
            })
    }

    return admin.firestore().collection('memes').doc(id).get()
        .then(snap => {
            const meme = snap.data();

            return Promise.all([
                sendNotification(meme.memePosterID),
                saveNotification(meme, meme.memePosterID),
                handleOtherComments(meme)
            ])
        })
        .catch(error => {
            console.log(`Error handling comment notification: ${error}`)
        });
});

/**
 * Function to send notification when new report is created
 * @type {CloudFunction<DocumentSnapshot>}
 */
exports.handleReportNotification = functions.firestore.document('reports/{reportId}').onCreate((snapshot, context) => {
    const report = snapshot.data()

    const payload = {
        notification: {
            title: "New report",
            body: report.reason
        }
    };

    return admin.messaging().sendToTopic('admin', payload)
        .catch(error => {
            console.log(`Error sending report notification: ${error}`)
        });
});

// Function to format date to dd-MMM-yyyy
function formatDate(date) {
    const monthNames = [
        "Jan", "Feb", "Mar",
        "Apr", "May", "Jun", "Jul",
        "Aug", "Sep", "Oct",
        "Nov", "Dec"
    ];

    const day = date.getDate();
    const monthIndex = date.getMonth();
    const year = date.getFullYear();

    return day + "-" + monthNames[monthIndex] + "-" + year;
}
