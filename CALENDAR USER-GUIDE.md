# User Guide

The web calendar interface allows users to have a visual representation of both their own and other users' schedules.

The interface utilizes FullCalendar.io, an open source, customizable Javascript package. The calendar currently supports search functionality of user schedules and allows users to choose from a variety of calendar views.

## FullCalendar.io

FullCalendar is a robust package, featuring many different views and options for customizability. The current display is set to the basic view, with only event data being displayed, however, there are additional options for loading resource availability that could be integrated. The package also offers a drag and drop option, which could be used to reschedule meetings, should that feature choose to be implemented in the future.

## Search Functionality

The interface features a simple search bar, which allows users to look up other users' schedules by email. The calendar will then auto-populate with any meetings that user has scheduled through the Meeting Scheduler application.

## Code Documentation

The primary files being utilized for the generation of this interface are "app.js", "calendar.js", and "basic-views.html", as well as the corresponding FullCalendar package files. The purpose of these files is outlined below:

- Basic-views.html: This file is displayed to the user to present them with the calendar template and the search bar. This file can be swapped for one of the others in the FullCalendar package to change display functionality.

- Calendar.js: This file utilizes angular to communicate with the web page and gather the appropriate data from the backend. The search query triggers a get request for the corresponding user and then gathers that user's meeting data, which is then used to populate the calendar interface.

- App.js: This file contains the various endpoints that can be used to gather data from the backend. The "/api/users" and "api/userid/meetings" endpoints are used to gather required information for the calendar.