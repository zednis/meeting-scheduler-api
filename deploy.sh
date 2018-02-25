#!/usr/bin/env bash
DATE=`date '+%Y%m%d%H%M%S'`
FILES="app.js package.json LICENSE README.md"

zip -r meeting-scheduler-$DATE.zip $FILES