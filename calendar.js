
var app = angular.module("CalendarApp", []);

app.controller('CalendarCtrl', function($scope, $http){
	$scope.events = [];

	$scope.createCalendar = function() {
		console.log("create calendar")
		$scope.calendar = $('#calendar').fullCalendar({
		  	header: {
		    	left: 'prev,next today',
		    	center: 'title',
		    	right: 'month,agendaWeek,agendaDay,listWeek'
		 	 },
			  defaultDate: Date(),
			  navLinks: true, // can click day/week names to navigate views
			  editable: false,
			  eventLimit: true, // allow "more" link when too many events
			  events: $scope.events
		});
		$('#calendar').fullCalendar( 'addEventSource', $scope.events );
	}

	//set the query to empty to start
	$scope.searchQuery = "";

	$scope.newSearch = function(){
		var url = 'http://meeting-scheduler.us-east-1.elasticbeanstalk.com/api/users';

		//load the variable to hold the contents of the query
		var query = {
			email: $scope.searchQuery
		};

		$http.get(url, {params:query}).then(function(response){
			console.log(response);
			if (response.data.items.length==0) {
				alert('Invalid user email, please try again.');
			}
			else {
				$scope.userID = response.data.items[0].userId;
				url = url + "/" + $scope.userID + '/meetings';

				$http.get(url, {params:$scope.userID}).then(function(response){
					if (response.data.meetings.length ==0){
						alert('This user currently has no events');
					}
					else {
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

						$scope.createCalendar();
					}

				}); //end of meetings function	
			}
		});
	}; //end of search function

}); //end of angular app
