angular.module( 'orderCloud' )

	.config( AddressesConfig )
	.controller( 'AddressesCtrl', AddressesController )
	.controller( 'AddressEditCtrl', AddressEditController )
	.controller( 'AddressCreateCtrl', AddressCreateController )
    .controller( 'AddressAssignCtrl', AddressAssignController )

;

function AddressesConfig( $stateProvider ) {
	$stateProvider
		.state( 'base.addresses', {
			url: '/addresses',
			templateUrl:'addresses/templates/addresses.tpl.html',
			controller:'AddressesCtrl',
			controllerAs: 'addresses',
			data: {componentName: 'Addresses'},
			resolve: {
				AddressList: function(Addresses) {
					return Addresses.List();
				}
			}
		})
		.state( 'base.addressEdit', {
			url: '/addresses/:addressid/edit',
			templateUrl:'addresses/templates/addressEdit.tpl.html',
			controller:'AddressEditCtrl',
			controllerAs: 'addressEdit',
			resolve: {
				SelectedAddress: function($stateParams, $state, Addresses) {
					return Addresses.Get($stateParams.addressid).catch(function() {
                        $state.go('^.addresses');
                    });
				}
			}
		})
		.state( 'base.addressCreate', {
			url: '/addresses/create',
			templateUrl:'addresses/templates/addressCreate.tpl.html',
			controller:'AddressCreateCtrl',
			controllerAs: 'addressCreate'
		})
        .state( 'base.addressAssign', {
            url: '/addresses/:addressid/assign',
            templateUrl: 'addresses/templates/addressAssign.tpl.html',
            controller: 'AddressAssignCtrl',
            controllerAs: 'addressAssign',
            resolve: {
                UserGroupList: function(UserGroups) {
                    return UserGroups.List();
                },
                AssignmentsList: function($stateParams, Addresses) {
                    return Addresses.ListAssignments($stateParams.addressid);
                },
                SelectedAddress: function($stateParams, $state, Addresses) {
                    return Addresses.Get($stateParams.addressid).catch(function() {
                        $state.go('^.addresses');
                    });
                }
            }
        })
}

function AddressesController( AddressList, TrackSearch ) {
	var vm = this;
	vm.list = AddressList;
    vm.searching = function() {
        return TrackSearch.GetTerm() ? true : false;
    };
}

function AddressEditController( $exceptionHandler, $state, SelectedAddress, Addresses ) {
	var vm = this,
        addressID = SelectedAddress.ID;
	vm.addressName = SelectedAddress.AddressName;
	vm.address = SelectedAddress;

	vm.Submit = function() {
		Addresses.Update(addressID, vm.address)
			.then(function() {
				$state.go('^.addresses');
			})
            .catch(function(ex) {
                $exceptionHandler(ex);
            });
	};

	vm.Delete = function() {
		Addresses.Delete(SelectedAddress.ID, false)
			.then(function() {
				$state.go('^.addresses')
			})
            .catch(function(ex) {
                $exceptionHandler(ex);
            });
	};
}

function AddressCreateController($exceptionHandler, $state, Addresses) {
	var vm = this;
	vm.address = {};

	vm.Submit = function() {
		Addresses.Create(vm.address)
			.then(function() {
				$state.go('^.addresses')
			})
            .catch(function(ex) {
                $exceptionHandler(ex);
            });
	};
}

function AddressAssignController($q, $state, Assignments, Underscore, AssignmentsList, UserGroupList, Addresses, UserGroups, SelectedAddress) {
    var vm = this;
    vm.list = UserGroupList;
    vm.AddressAssignments = AssignmentsList;
    vm.Address = SelectedAddress;

    function setSelected() {
        var assigned = Assignments.getAssigned(vm.AddressAssignments.Items, 'UserGroupID');
        angular.forEach(vm.list.Items, function(item) {
            if (assigned.indexOf(item.ID) > -1) {
                item.selected = true;
                var assignmentItem = Underscore.where(vm.AddressAssignments.Items, {UserGroupID: item.ID})[0];
                item.IsShipping = assignmentItem.IsShipping;
                item.IsBilling = assignmentItem.IsBilling;
            }
        });
    }
    setSelected();

    function AssignmentFunc() {
        return Addresses.ListAssignments(vm.Address.ID, null, vm.AddressAssignments.Meta.PageSize);
    }
    
    vm.saveAssignments = SaveAssignments;
    vm.pagingFunction = PagingFunction;

    function PagingFunction() {
        if (vm.list.Meta.Page < vm.list.Meta.TotalPages) {
            var queue = [];
            var dfd = $q.defer();
            queue.push(UserGroups.List(null, vm.list.Meta.Page + 1, vm.list.Meta.PageSize));
            if (AssignmentFunc !== undefined) {
                queue.push(AssignmentFunc());
            }
            $q.all(queue).then(function(results) {
                dfd.resolve();
                vm.list.Meta = results[0].Meta;
                vm.list.Items = [].concat(vm.list.Items, results[0].Items);
                if (results[1]) {
                    vm.AddressAssignments.Meta = results[1].Meta;
                    vm.AddressAssignments.Items = [].concat(vm.AddressAssignments.Items, results[1].Items);
                }
                if (AssignmentFunc !== undefined) {
                    setSelected();
                }
            });
            return dfd.promise;
        }
        else return null;
    }

    function SaveAssignments() {
        var assigned = Underscore.pluck(vm.AddressAssignments.Items, 'UserGroupID');
        var selected = Underscore.pluck(Underscore.where(vm.list.Items, {selected: true}), 'ID');
        var toAdd = Assignments.getToAssign(vm.list.Items, vm.AddressAssignments.Items, 'UserGroupID');
        var toUpdate = Underscore.intersection(selected, assigned);
        var toDelete = Assignments.getToDelete(vm.list.Items, vm.AddressAssignments.Items, 'UserGroupID');
        var queue = [];
        var dfd = $q.defer();
        angular.forEach(vm.list.Items, function(Item) {
            if ((Item.IsShipping || Item.IsBilling) && toAdd.indexOf(Item.ID) > -1) {
                queue.push(Addresses.SaveAssignment({
                    UserID: null,
                    UserGroupID: Item.ID,
                    AddressID: vm.Address.ID,
                    IsShipping: Item.IsShipping,
                    IsBilling: Item.IsBilling
                }));
            }
            else if (toUpdate.indexOf(Item.ID) > -1) {
                var AssignmentObject = Underscore.where(vm.AddressAssignments.Items, {UserGroupID: Item.ID})[0]; //Should be only one
                if (AssignmentObject.IsShipping !== Item.IsShipping || AssignmentObject.IsBilling !== Item.IsBilling) {
                    queue.push(Addresses.SaveAssignment({
                        UserID: null,
                        UserGroupID: Item.ID,
                        AddressID: vm.Address.ID,
                        IsShipping: Item.IsShipping,
                        IsBilling: Item.IsBilling
                    }));
                }
            }
        });
        angular.forEach(toDelete, function(ItemID) {
            queue.push(Addresses.DeleteAssignment(vm.Address.ID, null, ItemID));
        });
        $q.all(queue).then(function() {
            dfd.resolve();
            $state.reload($state.current);
        });
        return dfd.promise;
    }
}