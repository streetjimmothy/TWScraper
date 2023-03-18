/// <reference types="knockout" />

class TweetQuery {
	[index: string]: any;

	id: string;	//mongodb.ObjectId
	status: string; //Statuses = Statuses.Inactive
	query: string | undefined;
	start_time: Date | undefined;
	end_time: Date | undefined;
	num_tweets: number = 0;
	sample_method: string; //SampleMethods = SampleMethods.Sequential;
	pagination_token: string | undefined;
	next_run: Date | undefined;
	URI: string | undefined;

	//either created via UI or by parsing JSON from server
	constructor(doc?: any) {
		this.id = doc.id || "";
		this.status = doc.status || "INACTIVE";
		this.query = doc.query || "";
		this.start_time = new Date(doc.start_time) || new Date();
		this.end_time = new Date(doc.end_time) || new Date();
		this.num_tweets = doc.num_tweets || 0;
		this.sample_method = doc.sample_method || "SEQUENTIAL";
		this.pagination_token = doc.pagination_token || "";
	}

	//save to server
	save() {
	}
}

class TweetQueryVM {
	queries: KnockoutObservableArray<TweetQuery>;
	constructor() {
		this.queries = ko.observableArray(<any>[]);

		this.update();
	}

	async update() {
		let queries = await (await fetch("http://localhost/queries")).json();

		//need to reformat date elements slightly for HTML date picker
		this.queries = queries.map(
			(q:any) => {
				return new TweetQuery(q);
				// q["start_time"] = q["start_time"].replaceAll("Z", "");
				// q["end_time"] = q["end_time"].replaceAll("Z", "");
				// q["next_run"] = q["next_run"].replaceAll("Z", "");
			}
		);

		debugger;
		this.queries(queries);
	}

	addQuery() {
		this.queries.push(new TweetQuery())
	}

	//param should be by ID?
	removeQuery(query:TweetQuery) {
		this.queries.remove(query)
	}
}

window.onload = init;
function init() {
	ko.applyBindings(
		new TweetQueryVM(),
		document.getElementById("querylist")
	);
}