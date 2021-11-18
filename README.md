# CortexDB-Tableau-Connector

This is a sample prototype for a Tableau WDC CortexDB Connector

This prototype is build with the Tableau WDC SDK v2.3

## Howto start

First you have to clone the Tableau WDC Git repo and run npm install:

```sh
git clone https://github.com/tableau/webdataconnector.git
cd webdataconnector/
npm install
```

Then copy the ```CortexDBExample``` folder from this repo to the ```webdataconnector``` repo directory:

```sh
cp -R CortexDBExample <dir to webdataconnector>/Examples/
```

## Start simulation

To start the Tableau WDC simulator, change to the ```webdataconnector``` repo and call:

```sh
npm start
```

Now you can access the simulator by calling the URL in the browser:

```
http://localhost:8888/Simulator/index.html
```

In the input for the URL enter the following:

```
../Examples/CortexDBExample/cortexdbUniplexAPI.html
```

Now you can strep through the connector phases. For detailed docs see the official website:

```
https://tableau.github.io/webdataconnector/docs/
```
