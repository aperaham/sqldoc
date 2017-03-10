var React = require('react');
var Marked = require('marked');
var $ = require('jquery');
var d3 = require("d3");
var topojson = require("topojson");

var formatValue = function(value){
    // escape html tags
    value = value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // replace non-printed characters with their hex codes
    var non_printed_chars = [1,2,3,4,5,6,7,8,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31];

    if (non_printed_chars.some(function(c){ return value.indexOf(String.fromCharCode(c)) >= 0; })) { // if at least one non printed character found

        non_printed_chars.forEach(function(c){
            var c_hex = '<span class="non-printed-char">\\x'+c.toString(16).toUpperCase()+'</span>';
            var c_str = String.fromCharCode(c);
            value = value.replace(c_str, c_hex);
        });
    }

    // make links from URLs
    if (value.indexOf('http://') == 0 || value.indexOf('https://') == 0){
        value = '<a href="#" onClick="openExternal(\''+value+'\')">'+value+'</a>';
    }
    return value;
}

var SqlDoc = React.createClass({displayName: "SqlDoc",

    getInitialState: function(){
        this.floating_dsid = null;
        this.tables_headers = {};
        this.lastkeys = [0, 0]; // monitor for CMD+A for selection
        return null;
    },

    componentDidMount: function(){
        var dom_node = React.findDOMNode(this)
        dom_node.addEventListener('scroll', this.scrollHandler);
        window.addEventListener('keydown', this.keyHandler);
        window.addEventListener('keyup', this.keyUpHandler);

        if (this.mount_map){
            this.mountMap(dom_node);
        }
    },

    componentWillUnmount: function(){
        React.findDOMNode(this).removeEventListener('scroll', this.scrollHandler);
        window.removeEventListener('keydown', this.keyHandler);
        window.removeEventListener('keyup', this.keyUpHandler);
    },

    getRenderer: function(query){
        if (this.props.output == 'script'){
            return this.renderTable;
        } else {
            if (query.match('^\\s*---\\s+chart\s*.*') != null){
                return this.renderChart;
            } else if (query.match('^\\s*---\\s+csv\s*.*') != null){
                return this.renderCsv;
            } else if (query.match('^\\s*---\\s+hidden\s*.*') != null){
                return this.renderHidden;
            } else if (query.match('^\\s*---\\s+crosstable\s*.*') != null){
                return this.renderCrossTable;
            } else if (query.match('^\\s*---\\s+map\s*') != null){
                return this.renderMap;
            } else {
                return this.renderTable;
            }
        }
    },

    markdown: function(str){
        var renderer = new Marked.Renderer();
        renderer.link = function(href, title, text){
            return '<a href="#" onClick="openExternal(\''+href+'\');">'+text+'</a>'
        };
        return Marked(str, {renderer: renderer});
    },

    getHeader: function(query){
        var cut = query.replace(/^\s*---.*[\s\n]*/, '');
        var match = cut.match('^\s*/\\*\\*([\\s\\S]*?)\\*\\*/');
        if (match != null && match.length == 2){
            return React.createElement("div", {className: "markdown-block", dangerouslySetInnerHTML: {__html: this.markdown(match[1])}});
        } else {
            return null;
        }
    },

    getFooter: function(query){
        var idx = query.lastIndexOf('/**');
        var idx0 = query.indexOf('/**');
        var check = query.replace(/^\s*---.*[\s\n]*/, '');
        if (check.substr(0,3) == '/**' && idx == idx0){ // a single markdown passed, already generated as a header so pass by
            return null;
        }
        var cut = query.substr(idx);
        var match = cut.match('/\\*\\*([\\s\\S]*?)\\*\\*/[\\s\\r\\n]*$');
        if (match != null && match.length == 2){
            return React.createElement("div", {className: "markdown-block", dangerouslySetInnerHTML: {__html: this.markdown(match[1])}});
        } else {
            return null;
        }
    },

    getBlockQuery: function(query){
        if (typeof(this.props.showQuery) == 'undefined' || this.props.showQuery == false){
            return null;
        }
        return React.createElement("div", {className: "query-block"}, React.createElement("pre", null, query));
    },

    render: function(){

        try {

            var self = this;
            var blocks = [];
            var duration = 0;

            // floating columns header
            var floating_cols_header = React.createElement("div", {id: "floating-cols-header-"+this.props.eventKey, className: "floating-cols-header"})

            // document blocks
            this.rendered_records = {};
            for (var block_idx = 0; block_idx < this.props.data.length; block_idx++){

                duration += this.props.data[block_idx].duration;

                var renderer = this.getRenderer(this.props.data[block_idx].query);
                var datasets = this.props.data[block_idx].datasets.map(function(dataset, i){
                    var dsid = self.dsid(block_idx, i);
                    self.rendered_records[dsid] = 0;
                    return renderer(block_idx, dataset, i, self.props.data[block_idx].query);
                });

                var header = this.getHeader(this.props.data[block_idx].query);
                var footer = this.getFooter(this.props.data[block_idx].query);
                var block_query = this.getBlockQuery(this.props.data[block_idx].query);

                block = React.createElement("div", {key: "block_"+block_idx}, block_query, header, datasets, footer);
                blocks.push(block);
            }

            // button bar
            if (this.props.buttonBar == true){
                var buttonBar = React.createElement("div", {className: "duration-div"}, 
                    React.createElement("table", {className: "duration-table"}, 
                    React.createElement("tr", null, 
                    React.createElement("td", null, React.createElement("span", {className: "duration-word"}, "Time:"), " ", React.createElement("span", {className: "duration-number"}, duration), " ", React.createElement("span", {className: "duration-word"}, "ms")), 
                    React.createElement("td", null, React.createElement("button", {type: "button", className: "btn btn-info", onClick: this.props.onShare}, "share"))
                    )
                    )
                    );
            } else {
                var buttonBar = null;
            }


            return (
                React.createElement("div", {className: "output-console"}, 
                    floating_cols_header, 
                    buttonBar, 
                    blocks
                )
            );

            return React.createElement("div", null)

        } catch (err){
            return (

                React.createElement("div", {className: "error alert alert-danger"}, 
                    "SQLTABS ERROR. Please report the issue at ", React.createElement("b", null, "https://github.com/sasha-alias/sqltabs/issues"), " :", React.createElement("br", null), 
                    React.createElement("pre", null, 
                    err.stack
                    )
                )
            );
        }
    },

    dsid: function(block_idx, dataset_idx){
        return this.props.eventKey+"_"+block_idx+"_"+dataset_idx;
    },

    renderChart: function(block_idx, dataset, dataset_idx, query){
        var dsid = this.dsid(block_idx, dataset_idx);

        if (['PGRES_FATAL_ERROR', 'PGRES_BAD_RESPONSE'].indexOf(dataset.resultStatus) > -1) {
            return React.createElement("div", {key: 'err_'+dataset_idx, className: "query-error alert alert-danger"}, dataset.resultErrorMessage.toString());
        }

        var chart_type = query.match('^\\s*---\\s+chart\\s+([a-z\\-]*)\\s');
        if (chart_type != null && chart_type.length > 0){
            chart_type = chart_type[1];
        } else {
            chart_type = 'line';
        }
        var chart_args = query.match('^\\s*---\\s+chart\\s+[a-z\\-]*\\s*(.*)\\n');
        if (chart_args != null && chart_args.length > 0){
            chart_args = chart_args[1];
        } else {
            chart_args = '';
        };

        var chart_id = 'chart_'+dsid;

        var hidden_value = '<input id="data_'+chart_id+'" type="hidden" value="'+encodeURIComponent(JSON.stringify(dataset))+'"></input>';

        return(

            React.createElement("div", {
                "data-chart-id": chart_id, 
                "data-chart-type": chart_type, 
                "data-chart-args": chart_args, 
                dangerouslySetInnerHTML: {__html: hidden_value}})

        );
    },

    limit_ref: function(dsid){
        return "limit_"+dsid;
    },

    limit_item: function(dsid){
        return $("#"+this.limit_ref(dsid));
    },

    renderStaticRecord: function(block_idx, dataset_idx, record_idx, hlr_column){
        // generating text html is much faster than using react

        var fields = '<td class="record-rownum">'+(record_idx+1)+'</td>';
        var row = this.props.data[block_idx].datasets[dataset_idx].data[record_idx];
        for (var column_idx=0; column_idx < row.length; column_idx++){
            if (column_idx == hlr_column-1){ // skip rendering record highligting column
                continue;
            } else {
                var val = row[column_idx];
                if (val != null){
                    val = formatValue(val);
                }
                fields += '<td>'+val+'</td>';
            }
        }

        if (hlr_column != null && row.length >= hlr_column){
            var hlr_value = row[hlr_column-1];
            if (hlr_value == -1){
                var tr_class = "record-negative-hl";
            } else if (hlr_value == 0){
                var tr_class = "record-neutral-hl";
            } else if (hlr_value == 1){
                var tr_class = "record-positive-hl";
            } else {
                var tr_class = "record-no-hl";
            }
        } else {
            var tr_class = 'record-no-hl';
        }
        return '<tr class="'+tr_class+'">'+fields+'</tr>';
    },

    getRecordHighlightingColumn: function(block_idx){
        // record highlighting column is the `hlr=N` parameter defining the column number which is responsible for record highlighting

        var query = this.props.data[block_idx].query;

        var hlr_column = query.match("\\s*hlr\\s*=\\s*([0-9]*)");
        if (hlr_column != null && hlr_column.length > 0){
            var hlr_column = hlr_column[1];
        } else {
            var hlr_column = null;
        }
        return hlr_column;
    },

    renderTable: function(block_idx, dataset, dataset_idx, query){

        var dsid = this.dsid(block_idx, dataset_idx);

        if (dataset.resultStatus == 'PGRES_COMMAND_OK'){
            return React.createElement("div", {key: 'cmdres_'+dsid, className: "alert alert-success"}, dataset.cmdStatus);
        } else if (['PGRES_FATAL_ERROR', 'PGRES_BAD_RESPONSE'].indexOf(dataset.resultStatus) > -1) {
            return React.createElement("div", {key: 'err_'+dsid, className: "query-error alert alert-danger"}, dataset.resultErrorMessage.toString());
        } else if (dataset.resultStatus == 'PGRES_NONFATAL_ERROR') {
            return React.createElement("div", {key: 'err_'+dsid, className: "query-error alert alert-info"}, dataset.resultErrorMessage.toString());
        }

        // record highliting column option
        var hlr_column = this.getRecordHighlightingColumn(block_idx);

        var fields = dataset.fields;
        var rows = dataset.data;

        if (fields.length == 0){
            return null;
        }

        if (fields){
            var out_fields = fields.map(function(field, i){
                if (i != hlr_column-1){ // skip record highlighting column
                    return (React.createElement("th", {key: 'field_'+i}, field.name));
                }
            });
            out_fields.unshift(React.createElement("th", null, "#"));

            var floating_fields = fields.map(function(field, i){
                if (i != hlr_column-1){ // skip record highlighting column
                    return (React.createElement("div", {className: "floating-field", key: 'field_'+i}, field.name));
                }
            });
            floating_fields.unshift(React.createElement("div", {className: "floating-field"}, "#"));
            this.tables_headers[dsid] = floating_fields;
        };

        var out_rows = "";
        var omitted_count = 0;
        if (this.props.buttonBar){
            var limit = Math.min(100, rows.length-this.rendered_records[dsid]); // render only 1st 100 records, the rest render on scroll
        } else {
            var limit = rows.length; // render all
        }

        for (var i=this.rendered_records[dsid]; i <= limit; i++){

            if (i == limit){
                if (i<rows.length){
                    var omitted_count = rows.length - this.rendered_records[dsid] + 1;
                    var omitted_message = '<span id="'+this.limit_ref(dsid)+'" class="omitted-message">'+omitted_count+' more </span>';
                }
                break;
            }

            var row = this.renderStaticRecord(block_idx, dataset_idx, i, hlr_column);
            this.rendered_records[dsid] = this.rendered_records[dsid] + 1;

            out_rows += row;
        }

        if (omitted_count > 0){
            out_rows += '<tr><td colSpan="'+fields.length+1+'">'+omitted_message+'</td></tr>';
        }

        if (dataset.nrecords == 1){
            rword = 'row';
        } else {
            rword = 'rows';
        }

        return (

            React.createElement("div", {key: 'dataset_'+dsid}, 
                React.createElement("div", {className: "rows-count-div"}, 
                React.createElement("span", {className: "rows-count-bracket"}, "("), 
                React.createElement("span", {className: "rows-count-number"}, dataset.nrecords), " ", React.createElement("span", {className: "rows-count-word"}, rword), 
                React.createElement("span", {className: "rows-count-bracket"}, ")")
                ), 

                React.createElement("table", {id: 'dataset_'+dsid, className: "table-resultset table table-hover"}, 
                React.createElement("thead", null, 
                    React.createElement("tr", {id: "theader_"+dsid}, 
                    out_fields
                    )
                ), 
                React.createElement("tfoot", null, 
                    React.createElement("tr", {id: "tfooter_"+dsid}, React.createElement("td", null))
                ), 
                React.createElement("tbody", {dangerouslySetInnerHTML: {__html: out_rows}}
                )
                )
            )
        );
    },

    renderCrossTable: function(block_idx, dataset, dataset_idx, query){
        var data = dataset.data;
        var header = [];
        var sidebar = [];
        var values = {};
        var rows = {};
        for (rn in data){ // detect all pairs

            var val1 = data[rn][0];
            var val2 = data[rn][1];

            if (header.indexOf(val2) == -1){
                header.push(val2);
            }

            if (sidebar.indexOf(val1) == -1){
                sidebar.push(val1);
            }

            if (!(val1 in values)){
                values[val1] = {};
            }
            values[val1][val2] = data[rn][2];
        }

        for (n in sidebar){ // fill missing pairs with nulls
            var val1 = sidebar[n];
            rows[val1] = {};
            for (m in header){
                var val2 = header[m];
                if (val1 in values && val2 in values[val1]){
                    rows[val1][val2] = values[val1][val2]
                } else {
                    rows[val1][val2] = null;
                }
            }
        }

        var header_html = [React.createElement("td", null)];
        header.forEach(function(item){
            header_html.push(React.createElement("th", null, item));
        });
        header_html = React.createElement("tr", null, header_html);
        var rows_html = [];
        sidebar.forEach(function(item){
            var row = [];
            row.push(React.createElement("th", null, item));
            for (i in rows[item]){
                row.push(
                    React.createElement("td", null, rows[item][i])
                );
            }
            rows_html.push(React.createElement("tr", null, row));
        });

        return (
            React.createElement("table", {className: "table-resultset table table-bordered"}, 
                header_html, 
                rows_html
            )

        );
    },

    renderMap: function(block_idx, dataset, dataset_idx, query){
        return React.createElement("div", {className: "error alert alert-danger"}, " map rendering is not implemented yet ")
        this.mount_map = true;
        return React.createElement("div", null)
    },

    renderCsv: function(block_idx, dataset, dataset_idx, query){
        var dsid = this.dsid(block_idx, dataset_idx);

        var out_fields = [];
        if (dataset.fields){
            var out_fields = dataset.fields.map(function(field, i){
                var ret = [];
                ret.push(React.createElement("span", {className: "csv-field", key: "field_"+dsid+"_"+i}, '"'+field.name+'"'));
                if (i < dataset.fields.length-1){
                    ret.push(React.createElement("span", {className: "csv-separator"}, ","));
                }
                return ret;
            });
        }
        out_fields.push(React.createElement("br", null));

        var csv = "";

        for (var i=0; i<dataset.data.length; i++){
            var row = "";
            for (var j=0; j<dataset.data[i].length; j++){
                var val = dataset.data[i][j];
                if (val == null){
                    row += '<span class="csv-value">NULL</span>';
                } else {
                    row += '<span class="csv-value">"' + val.replace('"', '""') + '"</span>';
                }
                if (j != dataset.data[i].length-1){
                    row += '<span class="csv-separator">,</span>';
                }
            }
            row += "<br/>";
            csv += row;
        }

        if (dataset.nrecords == 1){
            rword = 'row';
        } else {
            rword = 'rows';
        }

        return (
        React.createElement("div", {key: 'dataset_'+dsid}, 
            React.createElement("div", {className: "rows-count-div"}, 
            React.createElement("span", {className: "rows-count-bracket"}, "("), 
            React.createElement("span", {className: "rows-count-number"}, dataset.nrecords), " ", React.createElement("span", {className: "rows-count-word"}, rword), 
            React.createElement("span", {className: "rows-count-bracket"}, ")")
            ), 
            React.createElement("div", {className: "csv-fields-div"}, 
            out_fields
            ), 
            React.createElement("div", {className: "csv-div", dangerouslySetInnerHTML: {__html: csv}})
        ));
    },

    renderHidden: function(block_idx, dataset, dataset_idx, query){
        return null;
    },

    selectAll: function(){ // select content of entire output
        node = React.findDOMNode(this);
        var range = document.createRange();
        range.selectNodeContents(node);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    },

    keyHandler: function(e){ // follow the pressed keys and trigger selectAll when ctrl+a or cmd+a pressed
        this.lastkeys[0] = this.lastkeys[1];
        this.lastkeys[1] = e.keyCode;
        if (
            this.lastkeys[0] == 91 && this.lastkeys[1] == 65 || // left cmd + a
            this.lastkeys[0] == 93 && this.lastkeys[1] == 65 || // right cmd + a
            this.lastkeys[0] == 17 && this.lastkeys[1] == 65    // ctrl + a
        ){
            this.selectAll();
            e.stopPropagation();
            e.preventDefault();
        }
    },

    keyUpHandler: function(e){ // reset lastkeys if the cmd or ctrl key was released
        if (e.keyCode == 91 || e.keyCode == 17){
            this.lastkeys = [0, 0];
        }
    },

    scrollHandler: function(e){
        var container = $(React.findDOMNode(this));
        for (var block_idx=0; block_idx < this.props.data.length; block_idx++){
            for (var dataset_idx=0; dataset_idx < this.props.data[block_idx].datasets.length; dataset_idx++){

                var dsid = this.dsid(block_idx, dataset_idx);


                // hide/show floating header
                var theader = $("#theader_"+dsid);
                var tfooter = $("#tfooter_"+dsid);
                if (typeof(theader.offset()) == 'undefined'){ // skip nontable blocks
                    continue;
                }
                var theader_offset = theader.offset().top - container.offset().top + theader.height();
                var tfooter_offset = tfooter.offset().top - container.offset().top;

                if (theader_offset < 0 && tfooter_offset > 0){
                    this.floating_dsid = dsid;
                    this.showFloatingHeader(dsid, theader.offset().left);
                } else {
                    if (dsid == this.floating_dsid){
                        this.hideFloatingHeader(dsid);
                    }
                }

                // render more records if needed
                var rendered = this.rendered_records[dsid];
                var len = this.props.data[block_idx].datasets[dataset_idx].data.length;
                if (rendered == len){
                    continue;
                }

                var limit_item = this.limit_item(dsid);

                if (typeof(limit_item) != 'undefined' && typeof(container) != 'undefined'){

                    var offset = limit_item.offset().top - container.offset().top - container.height();
                    if (offset < 0){
                        this.renderNext(block_idx, dataset_idx);
                    }
                }

            }
        }
    },

    renderNext: function(block_idx, dataset_idx){
        var dsid = this.dsid(block_idx, dataset_idx);
        var rendered = this.rendered_records[dsid];
        var len = this.props.data[block_idx].datasets[dataset_idx].data.length;
        var limit = Math.min(rendered+500, len);
        var limit_item = this.limit_item(dsid);
        var hlr_column = this.getRecordHighlightingColumn(block_idx);

        if (rendered == len){
            return;
        }

        var insert_html = '';
        for (var i = rendered; i<limit; i++){
            this.rendered_records[dsid] = this.rendered_records[dsid] + 1;

            var row_html = this.renderStaticRecord(block_idx, dataset_idx, i, hlr_column);

            insert_html += row_html;
        }

        if (insert_html != ''){
            limit_item.closest('TR').before(insert_html);
        }

        if (this.rendered_records[dsid] == len){
            limit_item.remove();
        } else {
            var rest = len-this.rendered_records[dsid];
            limit_item.text(rest+' more');
        }
    },

    floatingHeader: function(){
        return $('#floating-cols-header-'+this.props.eventKey);
    },

    showFloatingHeader: function(dsid, left){
        var self = this;
        this.floatingHeader().show().offset({
            left: left
        });
        var header_cols = (React.createElement("div", {className: "floating-header-table"}, 
            this.tables_headers[dsid]
            ));

        this.floatingHeader().html(React.renderToStaticMarkup(header_cols));

        this.floatingHeader().css({width: $('#dataset_'+dsid).width()});

        // get width of each column
        widths = [];
        $('#dataset_'+dsid+' th').each(function(){
            widths.push($(this).outerWidth());
        });

        // set width of floating column
        $('#floating-cols-header-'+this.props.eventKey+' .floating-field').each(function(i){
            $(this).css({width: widths[i]});
        });

        $(".output-console").bind('resize', function(e) {
            self.showFloatingHeader(dsid, left);
        });

    },

    hideFloatingHeader: function(dsid){
        this.floatingHeader().hide();
    },

    adjustFloatingHeader: function(){
        console.log(this.floatingHeader().is(':visible'));
    },

    mountMap: function(dom_node){
        // placeholder for future implementation
    },

});

module.exports = SqlDoc;
