
var app = angular.module("CalendarApp", []);

app.controller('CalendarCtrl', function($scope, $http){
	//set the query to empty to start
	$scope.searchQuery = "";

	$scope.newSearch = function(){
		var url = '/api/users';

		//load the variable to hold the contents of the query
		var query = {
			email: $scope.searchQuery
		};

		$http.get(url, {params:query}).then(function(response){
			console.log(response);
			if(response.status ==200){
				$scope.userID = response.data.items[0].userId;
				url = url + "/" + $scope.userID + '/meetings';

				$http.get(url, {params:$scope.userID}).then(function(response){
					var meetings = response.data.meetings;
					//Parse meetings array and form events array that will be used in the calendar interface
					$scope.events = []
					for (i=0; i < meetings.length; i++){
						temp = {
							title: meetings[i].name,
							start: meetings[i].startDateTime,
							end: meetings[i].endDateTime
						}
						$scope.events.push(temp);
					}
					loadCalendar($scope.events);
				}); //end of meetings function	
			}
		});
	}; //end of search function
}); //end of angular app

function loadCalendar(myEvents) {
	console.log("Function was called");
	console.log(myEvents);
	$('#calendar').fullCalendar({
	  header: {
	    left: 'prev,next today',
	    center: 'title',
	    right: 'month,basicWeek,basicDay'
	  },
	  defaultDate: Date(),
	  navLinks: true, // can click day/week names to navigate views
	  editable: true,
	  eventLimit: true, // allow "more" link when too many events
	  events: myEvents
	});
	$('#calendar').reload(true);
};

$(document).ready(function() {
	console.log("Ran main calendar function");
	$('#calendar').fullCalendar({
	  header: {
	    left: 'prev,next today',
	    center: 'title',
	    right: 'month,basicWeek,basicDay'
	  },
	  defaultDate: Date(),
	  navLinks: true, // can click day/week names to navigate views
	  editable: true,
	  eventLimit: true, // allow "more" link when too many events
	  events: []
	});
});