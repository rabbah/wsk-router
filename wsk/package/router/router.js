/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict"

let CfClient = require("cf-nodejs-client")


/**
 * Login to CF with user name and password. Useful to get an access token.
 *
 * {
 *   endpoint: "https://api.ng.bluemix.net",
 *   username:"guest",
 *   password: "secret",
 * }
 *
 * @param endpoint the CF api endpoint
 * @param username the CF login username
 * @param password the CF login password
 * @return access token
 */
function login({endpoint, username, password}) {
    if (!endpoint || typeof endpoint !== 'string' || !endpoint.trim()) {
        return Promise.reject('"endpoint" not defined, must be string.')
    } else if (!username || typeof password !== 'string') {
        return Promise.reject('"username" not defined, must be string.')
    } else if (!password || typeof password !== 'string') {
        return Promise.reject('"password" not defined, must be string.')
    } else {
        let cc = new CfClient.CloudController(endpoint)

        return cc
        .getInfo()
        .then(result => {
            let UsersUAA = new CfClient.UsersUAA
            UsersUAA.setEndPoint(result.authorization_endpoint)
            return UsersUAA.login(username, password)
        })
    }
}


/**
 * Lists routes.
 *
 * @param endpoint the CF api endpoint
 * @param token the CF access token
 * @param appname the name of the CF app to map/unmap routes for
 * @returns promise that resolves with { routes: Array[String] } or rejects with error
 */
function list(args) {
    return validateArgsBasic(args)
    .then(() => {
        let {Apps, Routes} = getCfClients(args.endpoint, args.token)
        return getAppRoutes(Apps, args.appname)
        .then(({routes, app_guid}) => routes.resources.map(r => r.entity.host))
        .then(routes => ({ routes: routes }))
    })
}

/**
 * Maps array of routes. Creates route if necessary.
 *
 * @param endpoint the CF api endpoint
 * @param token the CF access token
 * @param appname the name of the CF app to map/unmap routes for
 * @param org the org name (optional but if specified, space must also be specified)
 * @param space the space name (optional but if specified, org must also be specified)
 * @param routes Array[{ org: String, space: String }] of org/space routes to map (optional but either org/space is specified or routes are specified) 
 * @param results Array[{ route: String, ok: Boolean }] 
 */
function mapRoutes(args) {
    return validateArgsForMapRoutes(args)
    .then(requestedRouteAdditions => {
        let {Apps, Routes} = getCfClients(args.endpoint, args.token)

        return getAppRoutes(Apps, args.appname)
        .then(({routes, app_guid}) => {
            let {
                domain_guid,
                space_guid,
                routesToAdd
            } = filterAddDeleteAndGetIds(routes, args.appname, requestedRouteAdditions, new Set())

            return addRoutes(Apps, Routes, routesToAdd, app_guid, domain_guid, space_guid)
        }).then(result => {
            result.forEach(r => {
                console.log(r.ok ? '✔' : '✖', r.route)
                requestedRouteAdditions.delete(r.route)
            })

            // treat left overs as success (these are pre-existing routes)
            Array.from(requestedRouteAdditions).forEach(r => {
                console.log('✦', r)
                result.push({route: r, ok: true})
            })

            return { status: result }
        }).catch(error => {
            console.error("Error: " + error)
            return Promise.reject(error)
        })
    })
}


/**
 * Unmaps routes. Deletes route iff specified.
 *
 * @param endpoint the CF api endpoint
 * @param token the CF access token
 * @param appname the name of the CF app to map/unmap routes for
 * @param routes Array[String] routes to delete
 * @param deleteAfterUnmap optional, must be true to delete route (not just unmap)
 * @param results Array[{ route: String, ok: Boolean }] 
 */
function unmapRoutes(args) {
    return validateArgsForUnmapRoutes(args)
    .then(requestedRouteDeletions => {
        let {Apps, Routes} = getCfClients(args.endpoint, args.token)

        return getAppRoutes(Apps, args.appname)
        .then(({routes, app_guid}) => {
            let {
                domain_guid,
                space_guid,
                routesToDelete
            } = filterAddDeleteAndGetIds(routes, args.appname, new Set(), requestedRouteDeletions)

            return deleteRoutes(Apps, Routes, routesToDelete, app_guid, args.deleteAfterUnmap)
        }).then(result => {
            result.forEach(r => {
                console.log(r.ok ? '✔' : '✖', r.route)
                requestedRouteDeletions.delete(r.route)
            })

            // treat left overs as errors (these may be non-existing routes)
            Array.from(requestedRouteDeletions).forEach(r => {
                console.log('✦', r)
                result.push({route: r, ok: false})
            })

            return { status: result }
        }).catch(error => {
            console.error("Error: " + error)
            return Promise.reject(error)
        })
    })
}


/**
 * Validates input arguments for token-based operations.
 *
 * @param args the input arguments to validate
 * @returns a promise that resolves with unit if args are valid
 *          and rejects with appropriate error if args are not valid 
 */
function validateArgsBasic(args) {
    if (!args.endpoint || typeof args.endpoint !== 'string' || !args.endpoint.trim()) {
        return Promise.reject('"endpoint" not defined, must be string.')
    } else if (!args.token || typeof args.token !== 'object') {
        return Promise.reject('"token" not defined, must be object containing access/refresh token.')
    } else if (!args.appname || typeof args.appname !== 'string' || !args.appname.trim()) {
        return Promise.reject('"appname" not defined, must be string.')
    } else return Promise.resolve()
}

/**
 * Validates input arguments for map routes.
 *
 * @param args the input arguments to validate
 * @returns a promise that resolves with set of routes to unmap if args are valid
 *          and rejects with appropriate error if args are not valid 
 */
function validateArgsForMapRoutes(args) {
    return validateArgsBasic(args)
    .then(() => {
        let validRouteSegment = function(str) {
            return (typeof str === 'string') && (str.match(/^[0-9a-zA-Z]+$/) != null)
        }

        if ((args.org && !args.space) || (args.space && !args.org)) {
            return Promise.reject('"org" and "space" must both be defined if either is defined.')
        } else if ((args.org && args.space) || args.routes) {
            if (args.routes && !Array.isArray(args.routes)) {
                return Promise.reject('"routes" not defined, must be array containing org and space names as strings.')
            } else if (args.org && args.space) {
                args.routes = args.routes || []
                args.routes.push({org: args.org, space: args.space})
            }

            let requestedRouteAdditions = new Set(args.routes.filter(r => {
                return validRouteSegment(r.org) && validRouteSegment(r.space)
            }).map(({org, space}) => org+'-'+space).filter(r => r.length <= 63))

            if (requestedRouteAdditions.length != 0) {
                return Promise.resolve(requestedRouteAdditions)
            } else {
                return Promise.reject('"routes" does not contain any valid route names to map (org/space must be in [0-9a-zA-Z] and no more than 62 chracter total).')
            }
        } else {
            return Promise.reject('either "org" & "space" must be defined or "routes" must be defined to map routes.')
        }
    })
}

/**
 * Validates input arguments for unmap routes.
 *
 * @param args the input arguments to validate
 * @returns a promise that resolves with set of routes to unmap if args are valid
 *          and rejects with appropriate error if args are not valid 
 */
function validateArgsForUnmapRoutes(args) {
    return validateArgsBasic(args)
    .then(() => {
        if (!args.routes || !Array.isArray(args.routes)) {
            return Promise.reject('"routes" not defined, must be array containing route names as strings.')
        } else {
            let requestedRouteDeletions = new Set(args.routes.map(r => r.trim()).filter(r => r != ''))
            if (requestedRouteDeletions.length != 0) {
                return Promise.resolve(requestedRouteDeletions)
            } else {
                return Promise.reject('"routes" does not contain any route names to unmap.')
            }
        }
    })
}

/**
 * Filters <routes> to include requested deletions if any, and removes from
 * additions any routes that already exist. Find the domain and space GUID.
 */
function filterAddDeleteAndGetIds(routes, appname, requestedRouteAdditions, requestedRouteDeletions) {
    var domain_guid = undefined
    var space_guid = undefined
    let routesToAdd = new Set(requestedRouteAdditions)
    let routesToDelete = routes.resources.filter(route => {
        if (route.entity.host == appname) {
            domain_guid = route.entity.domain_guid
            space_guid = route.entity.space_guid
        }

        if (requestedRouteAdditions.has(route.entity.host)) {
            console.log('not adding route because it already exists:', route.entity.host)
            routesToAdd.delete(route.entity.host)
        }

        if (requestedRouteDeletions.has(route.entity.host)) {
            console.log('scheduling route for deletion:', route.entity.host)
            return true
        } else return false
    })

    return {
        domain_guid: domain_guid,
        space_guid: space_guid,
        routesToAdd: routesToAdd,
        routesToDelete: routesToDelete
    }
}

/**
 * Adds routes for <app>.
 * 
 * @returns array of promises, each resolves with added route names.
 */
function addRoutes(Apps, Routes, routes, app_guid, domain_guid, space_guid) {
    return Array.from(routes).reduce((addedSoFar, nextToAdd) => {
        return addedSoFar.then(list => {
            // add route:
            // http://apidocs.cloudfoundry.org/213/routes/creating_a_route.html
            console.log('adding:', nextToAdd, domain_guid, space_guid)
            let addRoute = Routes.add({
                domain_guid: domain_guid,
                space_guid: space_guid,
                host: nextToAdd
            })

            return addRoute
            .catch(error => {
                try {
                    error = JSON.parse(error)
                    if (error.error_code == "CF-RouteHostTaken") {
                        console.log('route already exists, associating only:', nextToAdd)
                        return Routes.getRoutes({q: `host:${nextToAdd}`}).then(result => result.resources[0])
                    } else return Promise.reject(error)
                } catch (e) {
                    return Promise.reject(error)
                }
            })
            .then(route => Apps.associateRoute(app_guid, route.metadata.guid))
            .then(() => {
                list.push({route: nextToAdd, ok: true})
                return list
            })
            .catch(error => {
                console.log(`error adding ${nextToAdd}:`, error)
                list.push({route: nextToAdd, ok: false})
                return list
            })
        })
    }, Promise.resolve([]))
}

/**
 * Deletes <routes> or unmaps them (but does not delete).
 * 
 * @returns sequence of promises, each resolves with deleted route names.
 */
function deleteRoutes(Apps, Routes, routes, app_guid, deleteAfterUnmap) {
    return routes.reduce((deletedSoFar, nextToDelete) => {
        return deletedSoFar.then(list => {
            // delete route:
            // http://apidocs.cloudfoundry.org/214/routes/delete_a_particular_route.html
            console.log(!!deleteAfterUnmap ? 'deleting:' : 'unmapping:', nextToDelete.entity.host, nextToDelete.metadata.guid)
            // Routes.remove deletes the route, here be more conservative and simply remove
            // the route association (unamp) for now only (deleteAfterUnmap is unset)
            let rmRoute = deleteAfterUnmap === true 
                          ? Routes.remove(nextToDelete.metadata.guid)
                          : Apps.unassociateRoute(app_guid, nextToDelete.metadata.guid)

            return rmRoute
            .then(() => {
                list.push({route: nextToDelete.entity.host, ok: true})
                return list
            })
            .catch(error => {
                console.log(`error deleting ${nextToDelete.entity.host}:`, error)
                list.push({route: nextToDelete.entity.host, ok: false})
                return list
            })
        })
    }, Promise.resolve([]))
}

function enhanceApps(Apps, {token_type, access_token}) {
    Apps.unassociateRoute = function (app_guid, route_guid) {
        let url = this.API_URL + '/v2/apps/' + app_guid + '/routes/' + route_guid

        let options = {
            method: 'DELETE',
            url: url,
            headers: {
                Authorization: token_type + ' ' + access_token
            }
        }

        return this.REST
        .request(options, "204", false)
        .catch(error => {
            if (error == "EMPTY_BODY") return
            else return Promise.reject(error)
        })
    }
}

function getCfClients(endpoint, token) {
    const apps = new CfClient.Apps(endpoint)
    const routes = new CfClient.Routes(endpoint)

    enhanceApps(apps, token)
    apps.setToken(token)
    routes.setToken(token)

    return {Apps: apps, Routes: routes}
}

function getAppRoutes(Apps, appname) {
    return Apps.getApps({q: `name:${appname}`})
    .then(result => {
        // http://apidocs.cloudfoundry.org/213/apps/list_all_apps.html
        if (result.resources.length == 1) {
            return result.resources[0]
        } else {
            return Promise.reject(`App ${appname} not found.`)
        }
    })
    .then(app => {
        // http://apidocs.cloudfoundry.org/214/apps/list_all_routes_for_the_app.html
        return Apps.getAppRoutes(app.metadata.guid).then(routes => ({routes: routes, app_guid: app.metadata.guid}))
    })
}

exports.login = login
exports.list = list
exports.map = mapRoutes
exports.unmap = unmapRoutes
