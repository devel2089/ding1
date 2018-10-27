var express  = require('express'),
path = require('path'),
bodyParser= require('body-parser'),
cons = require('consolidate'),
dust = require('dustjs-helpers'),
pg = require('pg'),
fs =require('fs'),
copyTo= require('pg-copy-streams').to,
copyFrom=require('pg-copy-streams').from,
stream=require('stream'),
http=require('http'),
ejs=require('ejs'),
multer=require('multer'),
streamifier=require('streamifier'),
cluster=require('cluster'),
app = express();
var port =process.env.PORT ||8080;

// restarts server if errors (in case files uploaded have same information)
if (cluster.isMaster) {
  cluster.fork();

  cluster.on('exit', function(worker, code, signal) {
    cluster.fork();
  });
}
// wraps whole application in server restart- unhandled exception 
if (cluster.isWorker) {

//const { Pool, Client} = require('pg')
//const connectionString = 'postgresql://postgres:postgres123@localhost:3000/crudapp'
//change on deploy

const {Pool, Client } = require('pg');

const pool = new Pool({
  user: 'ding',
  host: '138.197.149.207',
  database: 'ding',
  password: 'ding1',
  port: 5432,
})
    const client = new Client({
        user: 'ding',
        host: '138.197.149.207',
        database: 'ding',
        password: 'ding1',
        port: 5432,
    });

client.connect();
pool.connect();


//Set Default ext .dust

app.engine('dust',cons.dust);
app.engine('ejs',cons.ejs)
app.set('view engine', 'dust');
app.set('views', __dirname + '/views');
app.set('view engine','ejs')
app.set('views',__dirname+'/views');

//Set public folder

app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/query',function(req,res){

pool.query('SELECT * FROM sqldata',function(err,result){
    if(err) {
        return console.error('error running query',err);
    }
    res.render('index.dust',{sqldata:result.rows});
    
})
    
});

app.post('/add',function(req,res){
    
    pool.query ('INSERT INTO sqldata(name,query,des) VALUES($1,$2,$3)',[req.body.name,req.body.query,req.body.des]
    
);
    res.redirect('/query');
    
});

app.delete('/delete/:id',function(req,res){
   
    pool.query("DELETE FROM sqldata WHERE id = $1",
        [req.params.id]);
        res.redirect(200,'/query')
    
});

//edit
app.post('/edit',function(req,res){
    pool.query("UPDATE sqldata SET name=$1,query=$2,des=$3 WHERE id =$4",[req.body.name,req.body.query,req.body.des,req.body.id]);
    res.redirect('/query')
})

//main page



app.get('/', function (req, res) {
   
    
    pool.query('SELECT * FROM sqldata', function (err, result) {
        if (err) {
            return console.error('error running query', err);
        }
        res.render('download.ejs', { sqldata: result.rows });
     
    })


        
});
app.get('/sqlquery', function (req, res) {
 
    
    pool.query('SELECT * FROM sqldata', function (err, result) {
        if (err) {
            return console.error('error running query', err);
        }
        res.render('sqlquery.ejs', { sqldata: result.rows });
     
    })


        
});

//lastupload

app.get('/lastupload',function(req,res){
    pool.query('select "DateTime"::date from public."Transactions" order by "DateTime" desc limit 1',function(err,result){
        if (err){console.log (err)
        }
        res.render('lastupload.ejs',{datedata:result.rows})
    })
})



//pg-copy-stream ---- exports the results

app.post('/stream', (req, res) => {
  
   
  /* write a query variable , plug req.body.selecta ,JSON parse it */
 // var query=(JSON.parse(req.body.selecta))
 // UPDATE : NEW CODE DOES NOT NEED JSON PARSING
  var query=`${req.body.selecta}`
  


    
//change testtable when deploy
    var stream = client.query(copyTo(`COPY ${query} TO STDOUT With CSV HEADER DELIMITER','`));    
        stream.pipe(process.stdout);
        res.attachment('results.csv');
        stream.pipe(res);
        

    
    })
    // upload
    const storage = multer.memoryStorage();
    // Init Upload
    const upload = multer({
        storage: storage
    }).fields([{ name: 'fbai' }, { name: 'testtable' }, { name: 'newInv' }, { name: 'fbaSent' }])

    app.post('/upload', (req, res) => {
        upload(req, res, (err) => {
            // DELETE from the tables 

            /*beginning file upload 
            /*postgres from*/
            if (typeof (req.files['fbai']) != "undefined") {
                client.query(`DELETE from public."fbai";`)

                var fileup1 = streamifier.createReadStream(req.files['fbai'][0].buffer)

                var streamFile1 = client.query(copyFrom(`COPY fbai FROM STDIN With CSV HEADER DELIMITER ','`));
                fileup1.pipe(streamFile1);
            }
            if (typeof (req.files['testtable']) != "undefined") {
                client.query(`DELETE from public."testtable";`)

                var fileup2 = streamifier.createReadStream(req.files['testtable'][0].buffer)

                var streamFile2 = client.query(copyFrom(`COPY testtable FROM STDIN With CSV HEADER DELIMITER ','`));
                fileup2.pipe(streamFile2);
                client.query(`DO $$
                            BEGIN
                            IF EXISTS (select * from public."Transactions" where "DateTime" = (select "DateTime" from public."testtable" where "OrderID" is not null order by "DateTime" ASC LIMIT 1))
                            THEN DELETE from public."testtable";
                            ELSE insert into public."Transactions" select *, current_timestamp from public."testtable";
                            END IF;
                            END
                            $$;
                            `)
            }
            if (typeof (req.files['newInv']) != "undefined") {
                client.query(`DELETE from public."testpurchase";`)

                var fileup3 = streamifier.createReadStream(req.files['newInv'][0].buffer)

                var streamFile3 = client.query(copyFrom(`COPY newInv FROM STDIN With CSV HEADER DELIMITER ','`));
                fileup3.pipe(streamFile3);
                client.query(`DO
                $do$ BEGIN IF EXISTS (select * from vinylpurchaselog where purchasedate >= (select min(purchasedate) from testpurchase) LIMIT 1)
                THEN DELETE from testpurchase;
                ELSE insert into vinylpurchaselog select * from testpurchase;
	            update vinylinventory
	            set quantity = i.quantity+vinylinventory.quantity
	            from testpurchase as i
	            where vinylinventory.rollcode = i.rollcode;
                END IF;
                END
                $do$;`)



            }
            if (typeof (req.files['newInv']) != "undefined") {

                client.query(`DELETE from public."testfbasent";`)

                var fileup4 = streamifier.createReadStream(req.files['fbaSent'][0].buffer)

                var streamFile4 = client.query(copyFrom(`COPY fbaSent FROM STDIN With CSV HEADER DELIMITER ','`));
                fileup4.pipe(streamFile4);
                client.query(`DO $do$ BEGIN IF EXISTS (select * from fbasent where sentdate >= (select min(sentdate) from testfbasent) LIMIT 1) THEN DELETE from testfbasent; ELSE insert into fbasent select * from testfbasent; update vinylinventory
                set quantity = vinylinventory.quantity-i.rollused
                    from (select s.rollcode
                ,round(sum(s.total)/r.sheetequalvant,3) as rollused
                from (
                select v.fnsku, f.rollcode
                ,(sum(v.expectedquantity) * f.sheetequalvant) as total
                from testfbasent v
                left join vinylproduct f on f.fnsku = v.fnsku
                group by v.fnsku, f.rollcode, f.sheetequalvant
                ) s
                left join vinylroll r on r.rollcode = s.rollcode
                group by s.rollcode, r.sheetequalvant
                order by s.rollcode) as i
                    where vinylinventory.rollcode = i.rollcode;
                END IF;
                END
                $do$;
                `)



            }

            if (err) {
                res.redirect('./', {

                });
            } else {

                res.redirect('./');
            }

        });
    });
//sql query w/out results
    app.post('/postsql', (req, res) => {
        var postsqlquery = `${req.body.selecta}`
        pool.query(postsqlquery);
        res.redirect('/sqlquery')


    })


//Server
app.listen(port, function () {
    console.log('server started')
});

}
