#! /bin/bash

#API=http://meeting-scheduler.us-east-1.elasticbeanstalk.com/
API=http://127.0.0.1:3000/

# create users

curl -H "Content-Type: application/json" -X POST -d '{ "givenName":"Stephan","familyName":"Zednik", "email":"zednis@rpi.edu" }' $API/api/users
curl -H "Content-Type: application/json" -X POST -d '{ "givenName":"Max","familyName":"Wang", "email":"wangm13@rpi.edu" }' $API/api/users

# create rooms

curl -H "Content-Type: application/json" -X POST -d '{ "name":"Pikes Peak","resources":["whiteboard", "telepresence"] }' $API/api/rooms
curl -H "Content-Type: application/json" -X POST -d '{ "name":"Longs Peak","resources":["projector", "telepresence"] }' $API/api/rooms
curl -H "Content-Type: application/json" -X POST -d '{ "name":"Mt Evans","resources":["telepresence"] }' $API/api/rooms
curl -H "Content-Type: application/json" -X POST -d '{ "name":"Mt Harvard","resources":[] }' $API/api/rooms

# create meetings
curl -H "Content-Type: application/json" -X POST -d '{ "name":"Test Meeting", "startDateTime": "2018-04-20T12:00:00.00Z", "endDateTime": "2018-04-20T13:00:00.00Z", "participants":["zednis@rpi.edu"], "room": "Pikes Peak" }' $API/api/meetings
curl -H "Content-Type: application/json" -X POST -d '{ "name":"Test Meeting + Participant", "startDateTime": "2018-04-20T12:00:00.00Z", "endDateTime": "2018-04-20T13:00:00.00Z", "participants":["zednis@rpi.edu", "wangm13@rpi.edu"], "room": "Pikes Peak" }' $API/api/meetings






