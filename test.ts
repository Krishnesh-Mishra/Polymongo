import polymongo from './dist/index'
import mongoose from 'mongoose'

const wrapper = polymongo.createWrapper({
    mongoURI: 'mongodb://localhost:27017',
    retry: 3000,
    debug: {
        log: true,
        logPath: './some-location',
        logHandler: async (logMessage) => {
            // my function to process PolyMongo logs
            console.log(logMessage)
        }
    }
})

type WrapperOptions = polymongo.Types.wrapperOptions
type ConnectEvent = polymongo.Types.connectEvent

const rawMongoose = wrapper.adv.mongoose
const primaryConnection = wrapper.adv.getPrimaryConnection()
const sharedDefaultConnection = wrapper.adv.getSharedConnection()
const ping = await wrapper.ping()
const analyticsPing = await wrapper.ping('analytics')
const generalStats = wrapper.stats.general()
const defaultDbStats = await wrapper.stats.db()

const userSchema = new mongoose.Schema({ name: String })
const User = wrapper.wrapModel(mongoose.model('TypecheckUser', userSchema))
const analyticsUsers = await User.db('analytics').find()

wrapper.pool.configure(['analytics'], { maxConnections: 20, autoClose: true, ttl: 60000 })
await wrapper.pool.connect(['reporting'])

const exportStream = wrapper.actions.exportDBStream('analytics')
const importSummary = await wrapper.actions.importDBStream('analytics_backup', exportStream)

