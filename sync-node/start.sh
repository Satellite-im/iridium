#!/bin/bash
if [ $PEERID ]
then
    echo $PEERID > ./peerid.json
    pnpm concurrently "pnpm bootstrap" "pnpm example:sync"
else
    echo "PEERID env variable not set"
fi