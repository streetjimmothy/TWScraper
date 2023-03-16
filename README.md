# TWScraper
A UI for the Twitter API. Build a query, have the query run in the cloud with real time monitoring and save the results to a database.


## Prerequisites
* Twitter API access
* [node.js](https://nodejs.org/en/)
* a DocumentStore database (we recommend [mongoDB](https://www.mongodb.com/))
* [Typescript](https://www.typescriptlang.org/)

## Operation
1. Clone the repo
1. Add your Twitter API bearertoken to the source
1. Add your DocumentStore database details to the source
1. Build the project (run `tsc` from the repo root)
1. Run the server (run `node server` from the server folder)
1. Access the scraper client page from `http:\\localhost`
1. Enter your query/ies and hit run