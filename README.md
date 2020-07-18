# Dank Memes Functions

This repo contains the code used for providing additional backend functionality to the [Dank Memes](https://github.com/tirgei/DankMemes) app through [Firebase Functions](https://firebase.google.com/docs/functions). You can find the app in the Play Store - [Dank Memes](https://play.google.com/store/apps/details?id=com.gelostech.dankmemes).

## Use Case

In the app, Functions was used for:

- Updating app metadata e.g. No. of Users when a new user joins, No. of Memes when a new one is posted.
- Sending new memes alert when a certain target is reached (default = 20)
- Sending comment/like notifications to users.
- Alerting admins when a user reports a meme.
- Generating meme thumbnails when they are posted.
- etc

## Prerequisites

- [VS Code](https://code.visualstudio.com) / [WebStorm](https://www.jetbrains.com/webstorm/)
- [Node.js](https://nodejs.org/en/)
- [npm](https://www.npmjs.com) / [yarn](https://yarnpkg.com/en/)

Also, before setting up the Functions, follow the creating a Firebase Project for Dank Memes in the [Dank Memes](https://github.com/tirgei/DankMemes) app README.

## Project Setup

For a complete Firebase Functions setup, check out the docs - [Firebase Functions Setup](https://firebase.google.com/docs/functions/get-started). To setup the project, this guide assumes you already have [NodeJS](https://nodejs.org/en/) installed, the version used here is 14.3 but with >= 10 you should be okay.

To get started, clone the repo to your local machine

```console
foo@bar:~$ git clone https://github.com/tirgei/Dank-Memes-Functions.git
```

- CD into the project folder

```console
foo@bar:~$ cd Dank-Memes-Functions/
```

- Initialize the Firebase Project

```console
foo@bar:~$ firebase init
```

Follow the Firebase guide as prompted and in the process selecting `Javascript` as the language to be used. On complete setup Firebase will generate some additional files.

If during the prompt you did not install the NPM dependencies, proceed and install them now:

```console
foo@bar:~$ cd functions/ && npm install
```

After all is setup, you can proceed and deploy it to your Firebase project from the project root folder:

```console
foo@bar:~$ firebase deploy --only functions
```

That is all and you should now have Functions setup. You can proceed and test it out by using the app.

### License

```licence
Copyright 2020 Vincent Tirgei

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
