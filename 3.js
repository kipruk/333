
bioshost=$BIOS_HOSTNAME
if [ -z "$bioshost" ]; then
   bioshost=localhost
fi

biosport=$BIOS_HTTP_PORT
if [ -z "$biosport" ]; then
    biosport=9776
fi

bioscontractpath=$BIOS_CONTRACT_PATH
if [ -z "$bioscontractpath" ]; then
    # this is defaulted to the version of bios that only requires the preactivate_feature
    # newer versions may require 
    bioscontractpath="unittests/contracts/old_versions/v1.7.0-develop-preactivate_feature/eosio.bios"
fi

bioscurrencysymbol=$BIOS_CURRENCY_SYMBOL
if [ -z "$bioscurrencysymbol" ]; then
    bioscurrencysymbol="SYS"
fi

wddir=eosio-ignition-wd
wdaddr=localhost:8899
wdurl=http://$wdaddr

logfile=$wddir/bootlog.txt

if [ -e $wddir ]; then
    rm -rf $wddir
fi
mkdir $wddir

step=1
echo Initializing ignition sequence  at $(date) | tee $logfile

echo "FEATURE_DIGESTS: $FEATURE_DIGESTS" >> $logfile

echo "http-server-address = $wdaddr" > $wddir/config.ini

programs/keosd/keosd --config-dir $wddir --data-dir $wddir --http-max-response-time-ms 99999 2> $wddir/wdlog.txt &
echo $$ > ignition_wallet.pid
echo keosd log in $wddir/wdlog.txt >> $logfile
sleep 1

ecmd () {
    echo ===== Start: $step ============ >> $logfile
    echo executing: cleos --wallet-url $wdurl --url http://$bioshost:$biosport $* | tee -a $logfile
    echo ----------------------- >> $logfile
    programs/cleos/cleos  --wallet-url $wdurl --url http://$bioshost:$biosport $* >> $logfile 2>&1
    echo ==== End: $step ============== >> $logfile
    step=$(($step + 1))
}

wcmd () {
    ecmd wallet $*
}

cacmd () {
    programs/cleos/cleos  --wallet-url $wdurl --url http://$bioshost:$biosport system newaccount --transfer --stake-net "10000000.0000 "$bioscurrencysymbol --stake-cpu "10000000.0000 "$bioscurrencysymbol  --buy-ram "10000000.0000 "$bioscurrencysymbol eosio $* >> $logfile 2>&1
    ecmd system regproducer $1 $2
    ecmd system voteproducer prods $1 $1
}

sleep 2
ecmd get info

wcmd create --to-console -n ignition

curl http://$bioshost:$biosport/v1/chain/get_activated_protocol_features >> $logfile
ecmd set contract eosio $bioscontractpath eosio.bios.wasm eosio.bios.abi

for digest in $FEATURE_DIGESTS;
do
ecmd push action eosio activate "{\"feature_digest\":\"$digest\"}" -p eosio
done

ecmd create key --to-console
pubsyskey=`grep "^Public key:" $logfile | tail -1 | sed "s/^Public key://"`
prisyskey=`grep "^Private key:" $logfile | tail -1 | sed "s/^Private key://"`
echo eosio.* keys: $prisyskey $pubsyskey >> $logfile
wcmd import -n ignition --private-key $prisyskey
ecmd create account eosio eosio.bpay $pubsyskey $pubsyskey
ecmd create account eosio eosio.msig $pubsyskey $pubsyskey
ecmd create account eosio eosio.names $pubsyskey $pubsyskey
ecmd create account eosio eosio.ram $pubsyskey $pubsyskey
ecmd create account eosio eosio.ramfee $pubsyskey $pubsyskey
ecmd create account eosio eosio.saving $pubsyskey $pubsyskey
ecmd create account eosio eosio.stake $pubsyskey $pubsyskey
ecmd create account eosio eosio.token $pubsyskey $pubsyskey
ecmd create account eosio eosio.vpay $pubsyskey $pubsyskey
ecmd create account eosio eosio.wrap $pubsyskey $pubsyskey

ecmd set contract eosio.token unittests/contracts/eosio.token eosio.token.wasm eosio.token.abi
ecmd set contract eosio.msig unittests/contracts/eosio.msig eosio.msig.wasm eosio.msig.abi
ecmd set contract eosio.wrap unittests/contracts/eosio.wrap eosio.wrap.wasm eosio.wrap.abi

echo ===== Start: $step ============ >> $logfile
echo executing: cleos --wallet-url $wdurl --url http://$bioshost:$biosport push action eosio.token create '[ "eosio", "10000000000.0000 '$bioscurrencysymbol'" ]' -p eosio.token | tee -a $logfile
echo executing: cleos --wallet-url $wdurl --url http://$bioshost:$biosport push action eosio.token issue '[ "eosio", "1000000000.0000 '$bioscurrencysymbol'", "memo" ]' -p eosio | tee -a $logfile
echo ----------------------- >> $logfile
programs/cleos/cleos --wallet-url $wdurl --url http://$bioshost:$biosport push action eosio.token create '[ "eosio", "10000000000.0000 '$bioscurrencysymbol'" ]' -p eosio.token >> $logfile 2>&1
programs/cleos/cleos --wallet-url $wdurl --url http://$bioshost:$biosport push action eosio.token issue '[ "eosio", "1000000000.0000 '$bioscurrencysymbol'", "memo" ]' -p eosio >> $logfile 2>&1
echo ==== End: $step ============== >> $logfile
step=$(($step + 1))

ecmd set contract eosio unittests/contracts/eosio.system eosio.system.wasm eosio.system.abi
programs/cleos/cleos --wallet-url $wdurl --url http://$bioshost:$biosport push action eosio init '[0, "4,'$bioscurrencysymbol'"]' -p eosio >> $logfile 2>&1

pkill -15 
