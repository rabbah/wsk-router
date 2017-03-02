## path to wsk CLI
WSK="wsk"

## package name
PREFIX="router"

## install administrative actions in package
## requires presence of secrets file, see secrets.sample
## you can elide this requirement but then must provide all the required parameters
## when invoking the actions
function deploy() {
    if [ ! -e secrets ]; then
       echo "no secrets file found, see the sample file (secrets.sample) for an example."
       exit -1
    fi;

    npm install
    zip -q -r action.zip router.js package.json node_modules
    $WSK package update "${PREFIX}" -P secrets $@
    $WSK action update "${PREFIX}/list"  action.zip --kind nodejs:6 --main list    
    $WSK action update "${PREFIX}/map"   action.zip --kind nodejs:6 --main map
    $WSK action update "${PREFIX}/unmap" action.zip --kind nodejs:6 --main unmap
}

## run this to get a token which you can then use to create your secrets file
function login() {
    npm install
    zip -q -r action.zip router.js package.json node_modules
    $WSK package update "${PREFIX}"
    $WSK action update "${PREFIX}/login" action.zip --kind nodejs:6 --main login
    $WSK action invoke "${PREFIX}/login" -br -p username $1 -p password $2 -p endpoint ${3-'https://api.ng.bluemix.net'}
    $WSK action delete "${PREFIX}/login"
}

## remove all package actions
function teardown() {
    $WSK action delete "${PREFIX}/list"
    $WSK action delete "${PREFIX}/map"
    $WSK action delete "${PREFIX}/unmap"
    $WSK package delete "${PREFIX}"
}

function usage() {
    echo "Usage $0 [--deploy, --teardown, --login <username> <password> <endpoint>? ]"
}

case "$1" in
-d | --deploy )
shift
deploy $@
;;
-t | --teardown )
teardown
;;
--login )
shift
login $@
;;
* )
usage
esac
