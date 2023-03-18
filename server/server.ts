const DEBUG = (function () {
	var timestamp = function () { };
	timestamp.toString = function () {
		return "[" + (new Date).toISOString() + "]";
	};

	return {
		log: console.log.bind(console, '%s', timestamp)
	}
})();

import * as _path from "node:path";
import * as _url from 'url';

import * as mongodb from "mongodb";

//#region Twitter definitions
const BASE_TW_URI = `https://api.twitter.com/2/tweets/search/all?max_results=500&tweet.fields=attachments,author_id,conversation_id,created_at,entities,geo,id,in_reply_to_user_id,lang,public_metrics,possibly_sensitive,referenced_tweets,reply_settings,source,text,withheld&user.fields=created_at,description,entities,id,location,name,pinned_tweet_id,profile_image_url,protected,public_metrics,url,username,verified,withheld`;
const tw_expansions = [	//TODO: make query configurable
	"author_id",
	"referenced_tweets.id",
	"in_reply_to_user_id",
	"geo.place_id",
	"entities.mentions.username",
	"referenced_tweets.id.author_id"
];
//#endregion Twitter definitions

//#region DB connection
let tw_coll: mongodb.Collection<mongodb.Document>;
let tu_coll: mongodb.Collection<mongodb.Document>;
let tq_coll: mongodb.Collection<mongodb.Document>;
let dbretrytimeout = 1;
async function DBconnect() {
	try {
		const client = new mongodb.MongoClient(DBURI);
		await client.connect();
		tw_coll = client.db("Tweets").collection("tweets");
		tu_coll = client.db("Users").collection("users");
		tq_coll = client.db("Queries").collection("queries");
	} catch (err) {
		DEBUG.log("Could not connect to DB. Retrying...");
		dbretrytimeout = dbretrytimeout*2;
		if(dbretrytimeout > 100){
			DEBUG.log("Could not connect to database.");
			console.log(err);
			throw(err);
		}
		await setTimeout(DBconnect, dbretrytimeout*1000)
	}
}

async function loadqueries() {
	let querydocs = await tq_coll.find().toArray();
	let queries = [];
	for (let doc of querydocs) {
		queries.push(new TWQuery(doc));
	}
	return queries;
}

//#endregion DB connection

//#region Server
import express, { query } from 'express';
const server = express();
const port = process.env.PORT || 80;

server.get('/', (req, res) => {
	res.redirect("/index.html");
});

server.get('/queries', (req, res) => {
	res.send(queries);
});

let pagedir = _url.fileURLToPath(_path.join(_path.dirname(import.meta.url), "..\\client"))
server.use(express.static(pagedir))

function startServer() {
	server.listen(port, () => {
		DEBUG.log(`Server listening on port ${port}`)
	})
}
//#endregion Server  


//#region enums
enum Statuses {
	Active = "ACTIVE",
	Inactive = "INACTIVE",
	Deleted = "DELETED"
}

enum SampleMethods {
	Random = "RANDOM",
	Sequential = "SEQUENTIAL"
}
//#endregion enums


class TWQuery {
	[index: string]: any;

	id: mongodb.ObjectId | undefined;
	status: Statuses = Statuses.Inactive;
	query: string | undefined;
	start_time: Date | undefined;
	end_time: Date | undefined;
	num_tweets: number = 0;
	sample_method: SampleMethods = SampleMethods.Sequential;
	pagination_token: string | undefined;
	next_run: Date | undefined;
	URI: string | undefined;

	//doc is DB doc - null when created via REST
	//will REST create with a PUT body?
	//or do we do live edit/update? 
	constructor(doc?: any) {
		this.id = doc._id || new mongodb.ObjectId();
		this.status = doc.status || this.status;
		this.query = doc.query;
		this.start_time = new Date(doc.start_time);
		this.end_time = new Date(doc.end_time);
		this.num_tweets = doc.num_tweets;	//TODO: Calc instead of save?
		this.sample_method = doc.sample_method || this.sample_method;
		this.pagination_token = doc.pagination_token;
		this.next_run = new Date();
		this.updateURI();
		
	}

	updateURI(){
		this.URI = BASE_TW_URI + `&query=${this.query}`;
		if (this.sample_method == SampleMethods.Random) {
			let start_time = new Date(Math.random() * ((this.end_time!.valueOf() - this.start_time!.valueOf()) + this.start_time!.valueOf()))
			let end_time = start_time;
			end_time.setMinutes(start_time.getMinutes() + 1);
			this.URI += `&start_time=${this.start_time!.toISOString()}&end_time=${this.end_time!.toISOString()}`
		}
		this.URI += `&start_time=${this.start_time!.toISOString()}&end_time=${this.end_time!.toISOString()}`;

		if (tw_expansions) {
			this.URI += `&expansions=`
			for (let exp of tw_expansions) {
				this.URI += exp + ",";
			}
			this.URI = this.URI.slice(0, -1);	//drop the last comma from the previous op
		}
		if (this.pagination_token) {
			this.URI += `&pagination_token=${this.pagination_token}`;
		}
	}

	//live update
	//save to DB
	//run query
	//save query results
	//post query update params

	//called when updated via REST
	//param will be a REST body?
	update(body: any) {
		for (let k of Object.keys(body)) {
			if (this[k]) {
				this[k] = body[k];
			}
		}
		this.save();
	}

	save() {
		this.updateURI();
		if (this.id) {
			tq_coll.updateOne({ _id: this.id }, { $set: JSON.parse(JSON.stringify(this)) })
		} else {
			tq_coll.insertOne(JSON.parse(JSON.stringify(this)))
		}
	}

	async run() {
		if (this.URI) {
			DEBUG.log(`Requesting ${this.URI}`);

			let res = await fetch(
				this.URI,
				{ "headers": { "Authorization": `Bearer ${bearertoken}` } }
			)
			let data = await res.json();
			if (res.status == 200) {
				//save tweets to DB
				let tweets: Array<any> = [...data.data, ...data.includes.tweets];
				if (tweets) {
					let num_tweets = tweets.length;
					DEBUG.log("Saving tweets to DB...")
					for (let tweet of tweets) {
						tweet.query = this.query;
						tweet.URI = this.URI;
						tweet._id = tweet.id;
					}
					try {
						await tw_coll.insertMany(tweets, { ordered: false });
					} catch (err: any) {
						if (err.code == 11000) {	//duplicate key error
							num_tweets -= err.writeErrors.length;
						}else{
							DEBUG.log("Error saving tweets to database...")
							console.log(err);
							return;	//returning here should cause the same query to run next tick
						}
					}
					this.num_tweets += num_tweets;
					DEBUG.log("Tweets saved.");
				}
				this.pagination_token = data.meta.next_token;
			} else if (res.status == 429) {
				this.next_run = new Date(Date.now() + Number.parseInt(res.headers.get("x-rate-limit-reset")!) * 1000);	//x-rate-limit-reset is in seconds, sleeptime is ms
			}
			this.save();
		}
	}

	//save - save after every query and load fom POST
	//load - load loads indiscriminately from the DB or from a POST

	//run
	//calls a global method to execture the query, 
	//then a method to save the results to the database 
	//then updates itself
	//then saves itself
}

let queries: TWQuery[];
async function init() {
	DEBUG.log("Starting...")
	DEBUG.log("Connecting to database...")
	await DBconnect();
	queries = await loadqueries();
	DEBUG.log("Database connected.");
	DEBUG.log("Starting Server...");
	startServer();
	DEBUG.log("Server started.");
}

async function run(){
	//list of TWQueries, iterate on a loop, call run on each and then sleep
	for (let query of queries) {
		if(query.next_run! < new Date()){
			await query.run();
		}
	}
	setTimeout(run, 1);
}

async function main() {
	await init();
	DEBUG.log("Tweet Collection Started");
	run();
}
main();

