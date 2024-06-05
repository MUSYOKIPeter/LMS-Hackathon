const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const { check, validationResult } = require('express-validator');
const app = express();

// Configure session middleware
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Create MySQL connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'learning_management'
});

// Connect to MySQL
connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL: ' + err.stack);
        return;
    }
    console.log('Connected to MySQL as id ' + connection.threadId);
});

// Serve static files from the default directory
app.use(express.static(__dirname));

// Set up middleware to parse incoming JSON data
app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

// Define routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Define a User representation for clarity
const User = {
    tableName: 'users',
    createUser: function(newUser, callback) {
        connection.query('INSERT INTO ' + this.tableName + ' SET ?', newUser, callback);
    },
    getUserByEmail: function(email, callback) {
        connection.query('SELECT * FROM ' + this.tableName + ' WHERE email = ?', [email], callback);
    },
    getUserByUsername: function(username, callback) {
        connection.query('SELECT * FROM ' + this.tableName + ' WHERE username = ?', [username], callback);
    }
};

// Registration route
app.post('/register', [
    // Validate email and username fields
    check('email').isEmail().withMessage('Invalid email format'),
    check('username').isAlphanumeric().withMessage('Username must be alphanumeric'),

    // Custom validation to check if email and username are unique
    check('email').custom((value) => {
        return new Promise((resolve, reject) => {
            User.getUserByEmail(value, (err, results) => {
                if (err) {
                    console.error('Error checking email:', err);
                    return reject(new Error('Server Error'));
                }
                if (results.length > 0) {
                    return reject(new Error('Email already exists'));
                }
                resolve(true);
            });
        });
    }),
    check('username').custom((value) => {
        return new Promise((resolve, reject) => {
            User.getUserByUsername(value, (err, results) => {
                if (err) {
                    console.error('Error checking username:', err);
                    return reject(new Error('Server Error'));
                }
                if (results.length > 0) {
                    return reject(new Error('Username already exists'));
                }
                resolve(true);
            });
        });
    }),
], async (req, res) => {
    console.log('Received registration request with data:', req.body);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);
        console.log('Hashed password:', hashedPassword);

        // Create a new user object
        const newUser = {
            email: req.body.email,
            username: req.body.username,
            password: hashedPassword,
            full_name: req.body.full_name
        };

        console.log('Creating user:', newUser);

        // Insert user into MySQL
        User.createUser(newUser, (error, results, fields) => {
            if (error) {
                console.error('Error inserting user:', error.message);
                return res.status(500).json({ error: 'Registration failed due to server error.' });
            }
            console.log('Inserted a new user with id', results.insertId);
            res.status(201).json(newUser);
        });
    } catch (error) {
        console.error('Error during registration:', error.message);
        res.status(500).json({ error: 'Registration failed due to server error.' });
    }
});

// Login route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    // Retrieve user from database
    connection.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            res.status(401).send('Invalid username or password');
        } else {
            const user = results[0];
            // Compare passwords
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) throw err;
                if (isMatch) {
                    // Store user in session
                    req.session.user = user;
                    res.send('Login successful');
                } else {
                    res.status(401).send('Invalid username or password');
                }
            });
        }
    });
});

// Logout route
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.send('Logout successful');
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    // Assuming you have middleware to handle user authentication and store user information in req.user
    const userFullName = req.user.full_name;
    res.render('dashboard', { fullName: userFullName });
});

// Route to retrieve course content
app.get('/course/:id', (req, res) => {
    const courseId = req.params.id;
    const sql = 'SELECT * FROM courses WHERE id = ?';
    connection.query(sql, [courseId], (err, result) => {
        if (err) {
            throw err;
        }
        // Send course content as JSON response
        res.json(result);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
