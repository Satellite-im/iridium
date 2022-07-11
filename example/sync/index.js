import dotenv from 'dotenv'
dotenv.config({
  path: '../../.env',
})

import IridiumSyncAgent from '../../dist/sync-agent'

const agent = await IridiumSyncAgent.create('sync node seed')
