
(function () {
    var cortexConnector = tableau.makeConnector();

    cortexConnector.init = async function(initCallback) {
        tableau.log("Init phase called.");
        var connectionData = {};

        if (typeof tableau.connectionData != 'string' || tableau.connectionData.length == 0) {
            return;
        }
         
        connectionData = JSON.parse(tableau.connectionData);
        tableau.username=connectionData.username;
        tableau.password=connectionData.password;
        tableau.log("url: " + connectionData.url);
        
        var user = tableau.username;
        if (user != "###TOKEN###") {
            tableau.log("Try login with user '"+user+"'");
            var response = await getUpdLogin(connectionData.url, user, tableau.password);
            tableau.log(response);
            if (response.result.rc == 0) {
                tableau.log("Login succesful!");
                tableau.username = "###TOKEN###";
                tableau.password = response.result.data.UpdJsrHdl;
                initCallback();
            }
            else {
                tableau.abortWithError("Error on CortexDB login: rc=" + response.result.rc + " ; " + response.result.error);
            }   
        }
        else {
            initCallback();
        }
    };

    cortexConnector.getSchema = async function (schemaCallback) {
        tableau.log("getSchema called.");
        var connectionData = JSON.parse(tableau.connectionData);
        tableau.log("url: " + connectionData.url);
        var user = tableau.username;
        if (user == "###TOKEN###") {
            tableau.log("Using session: " + tableau.password);
        }
        else {
            tableau.abortWithError("No active Token found. We need to relogin here! Why?");
        }

        var TOKEN = tableau.password;

        if (connectionData.mode == 1) {
            var oSelect = {
                method : "Select",
                requestid: CORTEX_REQUEST_ID++,
                param : {
                    UpdJsrHdl: TOKEN,
                    select: {
                        "#T": "#Dst"
                    },
                    list: {
                        f: [
                            "#DstDef",
                            "#DstDsc",
                            "#DstFL"
                        ]
                    }
                }
            };

            var response = await getUpdData(connectionData.url, oSelect);
            console.log(response);
            if (response.result.rc != 0) {
                tableau.abortWithError("Error on selecting record definitions: rc=" + response.result.rc + " ; " + response.result.error);
            }

            var tables = [];
            for (var i = 0; i < response.result.data.d.length; i++) {
                if (response.result.data.d[i].l0d0[0] == "#") {
                    continue;
                }
                var rectype = {};
                rectype.id = response.result.data.d[i].l0d0;
                rectype.alias = response.result.data.d[i].l0d1;

                var cols = [];
                for (var j = 0; j < response.result.data.d[i].l0d2.length; j ++) {
                    cols.push({
                        id: response.result.data.d[i].l0d2[j].d,
                        dataType: tableau.dataTypeEnum.string
                    });
                }
                rectype.columns = cols;
                tables.push(rectype);
            }
            tableau.log(tables);
            schemaCallback(tables);  
        }
        else if (connectionData.mode == 2) {
            var oPost = {
                method : "getPortalRows",
                requestid: CORTEX_REQUEST_ID++,
                param : {
                    UpdJsrHdl: TOKEN,
                    portaliid: connectionData.portalid 
                }
            }
            tableau.log(oPost);
            
            var response = await getUpdData(connectionData.url, oPost);

            var tables = [];
            // iterate over portal groups
            for (var i = 0; i < response.result.data.g.length; i++) {    
                    
                // iterate over portal rows in the actual group
                for (var j = 0; j < response.result.data.g[i].z.length; j++) {
                    // if a row has no listdefinition, we must skip this entry
                    if (   response.result.data.g[i].z[j].listiid.length != 24 
                        || response.result.data.g[i].z[j].listiid.length == 0
                        || response.result.data.g[i].z[j].listiid[0] == '!') {
                        continue;
                    }

                    // technical id for portal row. Lets start with the portaliid with a "PR" prefix (meaning portal row)
                    var rowId = "PR"+response.result.data.i+response.result.data.g[i].z[j].rownr;
                    var rowAlias = response.result.data.n +" -> "+response.result.data.g[i].n+" -> "+response.result.data.g[i].z[j].n;
                    var listIId = response.result.data.g[i].z[j].listiid;
                    
                    var portalrow = {};
                    portalrow.id = rowId;
                    portalrow.alias = rowAlias;

                    // load list info
                    oPost = {
                        method : "getAdmListInfo",
                        requestid: CORTEX_REQUEST_ID++,
                        param : {
                            UpdJsrHdl: TOKEN,
                            listiid: listIId
                        }
                    }
                        
                    var responseList = await getUpdData(connectionData.url, oPost);
                    tableau.log(responseList);

                    var cols =[];
                    var fieldNoHeaderCnt = 1;
                    // in this prototype we can only work with one layer CortexDB lists
                    var listconfig = responseList.result.data[0];
                    for (var k = 0; k < listconfig.ff.length; k ++) {
                        if (listconfig.ff[k].did.indexOf("l0d") != 0) {
                            continue;
                        }

                        var idx = parseInt(listconfig.ff[k].did.substr(3));
                        var id = listconfig.ff[k].did;
                        var alias = listconfig.ff[k].h.length > 0 ? listconfig.ff[k].h : "NONAME_"+fieldNoHeaderCnt++;
                        var field = {
                            id: id,
                            alias: alias,
                            dataType: tableau.dataTypeEnum.string
                        };
                        cols[idx] = field;
                    }

                    portalrow.columns = cols;
                    tables.push(portalrow);    
                }   
                tableau.log(tables);
                schemaCallback(tables);
            }
        }
        else  {
            tableau.abortWithError("CortexDB data mode '"+connectionData.mode+"' is not implemented!");
        }
    };

    cortexConnector.getData = async function (table, doneCallback) {
        tableau.log("getData called.");
        var connectionData = JSON.parse(tableau.connectionData);
        tableau.log("url: " + connectionData.url);
        var user = tableau.username;
        if (user == "###TOKEN###") {
            tableau.log("Using session: " + tableau.password);
        }
        else {
            tableau.abortWithError("No active Token found. We need to relogin here! Why?");
        }
        var TOKEN = tableau.password;
        var tableId = table.tableInfo.id;
        var fields = [];
        for (var i=0; i < table.tableInfo.columns.length; i ++) {
            fields.push(table.tableInfo.columns[i].id)
        }

        if (connectionData.mode == 1) {
            var oSelect = {
                method : "Select",
                requestid: CORTEX_REQUEST_ID++,
                param : {
                    UpdJsrHdl: TOKEN,
                    select: {
                        "#T": tableId
                    },
                    list: {
                        f: fields
                    },
                    // limit here atm.
                    maxcount: parseInt(connectionData.maxcount)
                }
            };

            var response = await getUpdData(connectionData.url, oSelect);
            var data = [];
            tableau.log(response);
            if (response.result.rc != 0) {
                tableau.abortWithError("Error on selecting record definitions: rc=" + response.result.rc + " ; " + response.result.error);
            }
            tableau.log("count="+response.result.data.i.countget);
            if (response.result.data.i.countget == 0) {
                doneCallback();
            }

            for (var i=0; i < response.result.data.i.countget; i++) {
                if (i >= 100) break;
                var row={};
                for (var listKey in response.result.data.c) {
                    if (typeof response.result.data.d[i][listKey] != 'undefined') {
                        if (Array.isArray(response.result.data.d[i][listKey])) {
                            var res = "";
                            for (var k = 0; k < response.result.data.d[i][listKey].length; k++) {
                                if (res.length > 0) res += "; ";
                                res += response.result.data.d[i][listKey][k].d;
                            }
                        }
                        else {
                            row[response.result.data.c[listKey].s] = response.result.data.d[i][listKey];
                        }
                    }
                }
                data.push(row);
            }   
            tableau.log(data);
            table.appendRows(data);
            doneCallback();
        }
        else if (connectionData.mode == 2) {
            var portaliid = tableId.substr(2, 24);
            var portalrow = parseInt(tableId.substr(26));

            var oSelect = {
                method : "getPortalRowDataList",
                requestid: CORTEX_REQUEST_ID++,
                param : {
                    UpdJsrHdl: TOKEN,
                    portaliid: portaliid,
                    rownr: portalrow
                }
            };

            var response = await getUpdData(connectionData.url, oSelect);
            if (response.result.rc != 0) {
                tableau.abortWithError("CortexDB error on loading portal. rc=" + response.result.rc);
            }
            var data = [];
            for (var i = 0; i < response.result.data.d.length; i++) {
                var row = {};
                for (var j = 0; j < fields.length; j++) {
                    if (response.result.data.d[i][fields[j]] == 'undefined') {
                        continue;
                    }
                    row[fields[j]] = response.result.data.d[i][fields[j]]
                }
                data.push(row);
            }
            tableau.log(data);
            table.appendRows(data);
            doneCallback();
        }
        else  {
            tableau.abortWithError("CortexDB data mode '"+connectionData.mode+"' is not implemented!");
        }   
    }

    $(document).ready(function () {
        showUIPhase(1);
        var updUrl = "";
        var updToken = "";
        $("#phase1NextButton").click(function () {
            var paramObj = {
                url: "http://localhost:8889/" + $('#upd-url').val().trim().replace(/(^\w+:|^)\/\//, ''),
                username: $('#upd-user').val().trim(),
                password: $('#upd-pwd').val().trim(),
            };
            updUrl = paramObj.url;
            tableau.connectionData = JSON.stringify(paramObj);
            tableau.connectionName = "CortexDB - UniPlexDataservice";

            getUpdLogin(paramObj.url, paramObj.username, paramObj.password).then(function(response) {
                if (response.result.rc == 0) {
                    tableau.log("Login succesful!");
                    tableau.username = "###TOKEN###";
                    tableau.password = response.result.data.UpdJsrHdl;
                    updToken = response.result.data.UpdJsrHdl;
                    showUIPhase(2);
                }
                else {
                    $('#errorMsg').text(response.result.error + " [rc=" + response.result.rc + "]");
                    $('.upd-form-alert').show();
                }
            });
        });
        $("#phase2NextButton").click(function () {
            var checkedEl = $("input[name='dataSource']:checked").attr('id');
            if (checkedEl == "dataSourceRecordTypes") {
                showUIPhase("3a");
            }
            else {
                var post = {
                    method:"getPortalList",
                    requestid: CORTEX_REQUEST_ID++,
                    param : {
                        UpdJsrHdl: updToken                    }
                };

                getUpdData(updUrl, post).then(function(response) {
                    $('#debug').text(JSON.stringify(response));
                    for (var i = 0; i <  response.result.data.length; i++) {
                        var id=response.result.data[i].i;
                        var name=response.result.data[i].n;
                        $("#portalSelect").append('<option value="'+id+'" selected="">'+name+'</option>');
                    }                    
                    //$("#portalSelect").selectpicker("refresh");
                    showUIPhase("3b");
                });
            }
        });
        $("#phase3aNextButton").click(function () {
            var connectionData = JSON.parse(tableau.connectionData)
            connectionData.mode = 1;
            connectionData.maxcount = $('#upd-maxcount').val().trim();
            tableau.connectionData = JSON.stringify(connectionData);
            tableau.submit();
        });
        $("#phase3bNextButton").click(function () {
            var connectionData = JSON.parse(tableau.connectionData)
            var portalid = $( "#portalSelect option:selected" ).attr('value');
            console.log("portalid: " + portalid);
            connectionData.mode = 2;
            connectionData.portalid = portalid;
            tableau.connectionData = JSON.stringify(connectionData);
            tableau.submit();
        });
    });
    
    tableau.registerConnector(cortexConnector);
})();

// -----

var CORTEX_REQUEST_ID = 1;

async function getUpdData(url, postdata) {
    console.log("UpdData call started...");
    var res = await fetch(url, {
        method: 'POST', // *GET, POST, PUT, DELETE, etc.
        mode: 'cors', // no-cors, *cors, same-origin
        cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
        credentials: 'same-origin', // include, *same-origin, omit
        headers: {
        'Content-Type': 'application/json'
        },
        referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        body: JSON.stringify(postdata) // body data type must match "Content-Type" header
    });
    var jResponse = await res.json();
    return jResponse;
}

function getUpdLogin(url, user, pwd) {
    var post = {
        method: "getLogin",
        requestid: CORTEX_REQUEST_ID++,
        param: {
          user: user,
          pass: pwd,
          app: "UniplexDataservice"
        }
    }

    return getUpdData(url, post);
}

showUIPhase = function(phase) {
    var phaseStr = ".upd-form-phase";
    $(phaseStr).hide();
    $(phaseStr+"-"+phase).show();
}