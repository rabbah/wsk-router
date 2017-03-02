## Deploy OpenWhisk actions to manage whisk router CF App

The router management is done via an OpenWhisk [action](router.js). There are three administrative actions:

1. `list`: lists currently mapped routes
2. `map`: creates a route if necessary and maps it to the router
3. `unmap`: unmaps a route (unless explicitly requested, the route is not deleted)

### Configuring the action parameters

You will need to bind a valid CF access token to the package to allow the actions to use the CF API. The deployment script assumes a file called `secrets` exists in this directory containing configuration parameters as well as the access token. A template is provided in [secrets.sample](secrets.sample). You may already have such a token in `$HOME/.cf/config.json`. If not, you can
run an action to retrieve one (or perform a `cf login` and inspect the file `$HOME/.cf/config.json`). To use the `login` action provided:
```bash
$ ./deploy --login <username> <password> <endpoint>
```

For Bluemix, the `endpoint` is `https://api.ng.bluemix.net`. This is the default value if you do not specify an `endpoint`.
You can save the output of the action into a file called `secrets`.

You do not have to use the `secrets` file to bind parameters to the package. It's done for convenience when running the actions. If you remove the parameter binding for the access token, simply provide it when invoking one of the adminstrative actions.

### Deploy OpenWhisk actions

A helper [script](deploy.sh) is provided to deploy the adminstrative actions.

```bash
$ ./deploy.sh                                # usage  info
$ ./deploy.sh --deploy -p appname <appname>  # deploy actions
$ ./deploy.sh --teardown                     # delete actions
```

### Working with administrative actions

#### To list existing routes
```bash
$ wsk action invoke -br router/list
```

#### To map a new route
```bash
$ wsk action invoke -br router/map -p org <name> -p space <name>
```

#### To unmap a route
```bash
$ wsk action invoke -br router/unmap -p routes '[<org name>-<space name>]'
```

#### To unmap and delete a route:
```bash
$ wsk action invoke -br router/unmap -p routes '[<org name>-<space name>]' -p deleteAfterUnmap true
```
