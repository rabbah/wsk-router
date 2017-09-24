## Deploy NGINX as a CF App

The following assumes some familiarity with CloudFoundry Apps and the `cf` command line tool.
To deploy the whisk-router reverse proxy:

```bash
# login to cf endpoint, if necessary
$ cf login

# push the app, replacing APP_NAME below with your preferred name 
$ cf push APP_NAME \
     -b https://github.com/cloudfoundry/staticfile-buildpack.git \
     -m 64m
```

The [NGINX configuration](nginx.conf) performs the following:

1. Redirects all HTTP traffic to HTTPS.
2. Extracts the CF organization (org) and space (space) from the request URL server_name `~^(?<org>[0–9a-zA-Z-]+)-(?<space>[0–9a-zA-Z-]+)\.*$;`.
3. Rewrites the request to a web action URI `/(.*) to /api/v1/web/${org}_${space}/$1`. The rewrite rule allows for a general mapping from org/space pairs to OpenWhisk namespaces, treating the rest of the URL as the package name, action name, and extension.
4. Proxies the request to `https://openwhisk.ng.bluemix.net` which is the OpenWhisk API host on Bluemix.

