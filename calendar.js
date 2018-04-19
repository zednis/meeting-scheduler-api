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
					$scope.meetings = response.data.meetings;
				});	
			}
		});
	}; //end of search function
});