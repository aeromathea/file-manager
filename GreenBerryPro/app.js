const fs = require('fs');
const path = require('path');
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const mime = require('mime-types');

//set up database connection
var conn = mysql.createConnection({
    host: 'localhost',
    port: '3308',
    user: 'pi',
    password: 'chickenlover',
    database: 'green_berry'
});

conn.connect();

/*
//sample queries
conn.query('INSERT INTO Users (Username, Password) VALUES (?, SHA(?))', ['Jacob', '123'], function(err, results, fields) {
  if(err) throw err;
  console.log('Inserted successfully');
});
*/

/*
conn.query('SELECT * FROM Users', function(err, results, fields) {
  if(err) throw err;
  results.forEach(function(item, index) {
    console.log(index, item.Username, item.Password);
  });
});

files.forEach(function(item) {
	switch(mime.lookup(item.Link)) {
		case 'video/mp4':
			item.Icon = 'assets/mp4Icon.png';
			break;
		case 'application/pdf':
			item.Icon = 'assets/pdfIcon.png';
			break;
		case 'image/png':
			item.Icon = 'assets/pngIcon.png';
			break;
		case 'image/jpeg':
			item.Icon = 'assets/jpgIcon.png';
			break;
		case 'image/gif':
			item.Icon = 'assets/gifIcon.png';
			break;
		case 'text/html':
			item.Icon = 'assets/htmlIcon.png';
			break;
		case 'text/x-php':
			item.Icon = 'assets/phpIcon.png';
			break;
		default:
			item.Icon = 'assets/textIcon.png';
	}
});
*/


//initialize express.js
var app = express();

//set up template engine
app.set('view engine', 'ejs');
app.set('views', './views');

//static files
app.use(express.static('./public'));

//handle post requests
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//accept cookies
app.use(cookieParser());

//handle requests
app.get('/', function (req, res) {
    if (req.cookies.userData) {
        isUserValid(req.cookies.userData, function () {
            res.redirect('/home');
        }, function () {
            res.redirect('/login');
        });
    } else {
        res.redirect('/login');
    }
});

app.get('/home', function (req, res) {
    if (req.cookies.userData) {
        isUserValid(req.cookies.userData, function () {
            //user is in database
            if (req.query.folder) {
                isInDatabase('SELECT Path FROM Folders WHERE User = ? AND Path = ?', [req.cookies.userData.name, req.query.folder], function () {
                    //folder specified by GET query is in database
                    conn.query('SELECT CONCAT(REPEAT("&emsp;", LENGTH(Path) - LENGTH(REPLACE(Path, "/", "")) - 1), SUBSTRING(Path, LENGTH(Parent_Path) + 2)) AS Name, Path FROM Folders WHERE User = ? ORDER BY Path', [req.cookies.userData.name], function (err, folders) {
                        //get tab-separated folder names
                        if (err) throw err;
                        conn.query('SELECT SUBSTRING(Path, LENGTH(Parent_Path) + 2) AS Name, Path FROM Folders WHERE Parent_Path = ?', [req.query.folder], function (err, subfolders) {
                            //get immediate subfolders of the current folder
                            if (err) throw err;
                            conn.query('SELECT Id, User, Owner, Name, Size, DATE_FORMAT(Date, "%c.%e.%Y") AS Date, DATE_FORMAT(Date, "%l:%i %p") AS Time, CONCAT(Path, "/", Name) AS Link, Is_Shared, Is_Public FROM Files WHERE User = ? AND Path = ?', [req.cookies.userData.name, req.query.folder], function (err, files) {
                                //get all the files in the current folder of the current user
                                if (err) throw err;
                                //INSERT CHECK FOR MIME TYPES OF FILES AND ASSIGN ICON PATHS ACCORDINGLY HERE
                                conn.query('SELECT * FROM User_Settings WHERE User = ?', [req.cookies.userData.name], function (err, settings) {
                                    //get the user's settings/permissions
                                    if (err) throw err;
                                    console.log(req.query.folder);
                                    console.log('\n');
                                    console.log(folders);
                                    console.log('\n');
                                    console.log(subfolders);
                                    console.log('\n');
                                    console.log(files);
                                    console.log('\n');
                                    console.log(settings);
                                    res.render('home', { folder: req.query.folder, folders: folders, subfolders: subfolders, files: files, settings: settings });
                                })
                            });
                        });
                    });
                }, function () {
                    //folder specified by GET query is NOT in database
                    res.redirect('/home?folder=.%2F' + req.cookies.userData.name);
                });
            } else {
                //no folder is specified by GET query
                res.redirect('/home?folder=.%2F' + req.cookies.userData.name);
            }
        }, function () {
            //user is NOT in database
            res.redirect('/login');
        });
    } else {
        //no user is logged in
        res.redirect('/login');
    }
});

app.get('/view/:filepath', function (req, res) {
    if (fs.existsSync(req.params.filepath)) {
        res.render('view', { filename: path.basename(req.params.filepath), filepath: encodeURIComponent(req.params.filepath) });
    } else {
        res.redirect('/404?path=' + encodeURIComponent(req.params.filepath));
    }
});

app.get('/videos/:filepath', function (req, res) {
    //validate user permissions for file
    const filepath = req.params.filepath;
    if (fs.existsSync(filepath)) {
        const stat = fs.statSync(filepath);
        const fileSize = stat.size;
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1
            const file = fs.createReadStream(filepath, { start, end })
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4'
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4'
            };
            res.writeHead(200, head);
            fs.createReadStream(filepath).pipe(res);
        }
    } else {
        res.redirect('/404?path=' + encodeURIComponent(filepath));
    }
});

app.get('/login', function (req, res) {
    res.render('login');
});

app.post('/login', function (req, res) {
    conn.query('SELECT SUBSTRING(Password, 5, 10) AS Password FROM Users WHERE Username = ? AND Password = SHA(?)', [req.body.uname, req.body.pword], function (err, results, fields) {
        if (err) throw err;
        if (results.length) {
            res.cookie('userData', { name: req.body.uname, password: results[0].Password }, { httpOnly: true, secure: false });
            res.redirect('/home');
        } else {
            res.render('login', { message: "invalid credentials" });
        }
    });
});

app.get('/pdf', function (req, res) {
    res.render('pdf');
});

app.get('/pdfFile/:h', function (req, res) {
    fs.readFile('./CourseReschedule.pdf', function (err, data) {
        res.contentType('application/pdf');
        res.send(data);
    });
})

/*
app.get('/pdf', function(req, res) {
	res.render('pdf');
});

app.get('/pdfFile/:filename', function(req, res) {
	const filename = req.params.filename;
	var readStream = fs.createReadStream('./CourseReschedule.pdf');
    // We replaced all the event handlers with a simple call to readStream.pipe()
    readStream.pipe(res);
});
*/

/*
app.all('*', function(req, res) {
 	res.render('404');
});
*/

//check if userData cookie matches with information in the database
function isUserValid(userData, isTrue, isFalse) {
    conn.query('SELECT SUBSTRING(Password, 5, 10) AS Password FROM Users WHERE Username = ?', [userData.name], function (err, results, fields) {
        if (err) throw err;
        if (results[0].Password === userData.password) {
            isTrue();
        } else {
            isFalse();
        }
    });
}

//checks if a query yields a set of values from the database
function isInDatabase(stmt, parameters, isTrue, isFalse) {
    conn.query(stmt, parameters, function (err, results, fields) {
        if (results.length > 0) {
            isTrue();
        } else {
            isFalse();
        }
    });
}

//listen to port 80
app.listen(80);
console.log('Listening on port 80...');
