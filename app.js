// const options = {
//   key: fs.readFileSync("C:\\Users\\Dell\\private-key.pem"),
//   cert: fs.readFileSync("C:\\Users\\Dell\\certificate.pem"),
// };
const express = require('express');
const bodyParser=require('body-parser')
var session = require('express-session')
const os =require("os")
const { Employee, Company } = require("./db");
const http = require('http')
const app = express();
const cors = require('cors');
const {WebSocket}=require("ws")
const cron=require('node-cron')
// import {app} from 'electron'//
const fs=require('fs/promises')
const { join }=require('path')
const mongoose =require('mongoose');
const jwt = require('jsonwebtoken');
const dotenv=require('dotenv')
dotenv.config() 
const server=http.createServer(app)
const PORT = 3001;

// const userDataPath = app.getPath('userData');
const userDataPath = join(__dirname, 'userdata.json');
const dataFilePath = join(userDataPath, 'userdata.json');
let currentCronJob;

async function saveUserData(data) {
  try {
    await fs.writeFile(dataFilePath, JSON.stringify(data));
    console.log('User data saved successfully.');
  } catch (error) {
    console.error('Error saving user data:', error);
  }
}
//remove cron jobs
const clearExistingCronJob = () => {
    if (currentCronJob) {
      console.log("Stopping the existing cron job...");
      currentCronJob.stop(); // Stop the current cron job
      currentCronJob = null;  // Clear the reference
    }
  };
// Middleware to verify JWT
function verifyToken(req, res, next) {
    const token = req.headers['authorization'];
    console.log("token retrieved: ",token)
    if (!token) {
      return res.status(401).json({error:'Access denied. No token provided.'});
    }
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("decoded token: ",decoded)
      req.user = decoded; // Store the decoded token data (userId, email, etc.) in req.user
      next();
    } catch (error) {
      res.status(400).json({message:'Invalid token.'});
    }
  }
  

async function loadUserData() {
  try {
    const data = await fs.readFile(dataFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading user data:', error);
    return null;
  }
}
function returnRandomOutput(inputList){
    const randomIndex = Math.floor(Math.random() * 4);

    // Get the field name corresponding to the random index
    let output = '';

    // Return a pair of values based on the selected field
    switch (randomIndex) {
        case 0://events 
            if (inputList[randomIndex].length > 0) {
                const randomEvent = inputList[randomIndex][Math.floor(Math.random() * inputList[randomIndex].length)];
                output = `${randomEvent.name}, ${randomEvent.description}`;
            }
            break;
        case 1://rules
            if (inputList[randomIndex].length > 0) {
                const randomRule = inputList[randomIndex][Math.floor(Math.random() * inputList[randomIndex].length)];
                output = `Rule: ,${randomRule}`;
            }
            break;
        case 2://tasks
            if (inputList[randomIndex].length > 0) {
                const randomTask = inputList[randomIndex][Math.floor(Math.random() * inputList[randomIndex].length)];
                output = `${randomTask.name}, ${randomTask.details}`;
            }
            break;
        case 3://urgents
            if (inputList[randomIndex].length > 0) {
                const randomUrgent = inputList[randomIndex][Math.floor(Math.random() * inputList[randomIndex].length)];
                output = `Urgent: ,${randomUrgent}`;
            }
            break;
        default:
            output = "No valid field selected";
    }

    return output || `No data available for :,${randomIndex}`;
}

mongoose.connect(process.env.MONGODB_LINK);


const db = mongoose.connection;

app.use(cors());
  // Set up the WebSocket server
  const wss = new WebSocket.Server({ noServer: true });
  app.use(session({
      
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 30 days 
      }
  }));




  app.use(bodyParser.urlencoded({extended:true}));
  app.use(bodyParser.json());
 

  app.use(express.json());
  db.on('error', console.error.bind(console, 'Connection error:'));
  db.once('open', async function () {
    console.log('Connected to the database');
    //do something
    try{
        server.on('upgrade', (req, socket, head) => {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit('connection', ws, req);
            });
          });
        //   await Company.updateOne({serialId:"RFGS0v"},
        //     {$set:{adsLink:"https://www.youtube.com/embed/nToFz87NdyE?si=uVorKBTtZpSB3fSv"}})
        app.post('/login', async (req, res) => {
            try {
                const { userId, password } = req.body;
                const loginEmployee = await Employee.findOne({ userId, password });
                const loginCompany = await Company.findOne({ userId, password });
                
                if (loginEmployee) {
                    const accessToken = jwt.sign(
                        { userId: loginEmployee.userId, email: loginEmployee.email },
                        process.env.JWT_SECRET,
                        { expiresIn: '24h' } // Token expires in 24 hours
                    );
                    
                    res.status(200).json({ loginInfo: "employee", name: loginEmployee.name, accessToken });
                } else if (loginCompany) {
                    const accessToken = jwt.sign(
                        { userId: loginCompany.userId, email: loginCompany.email },
                        process.env.JWT_SECRET,
                        { expiresIn: '1h' }
                    );
                    
                    res.json({ loginInfo: "company", accessToken });
                } else {
                    res.json({ loginInfo: "notFound" });
                }
            } catch (error) {
                console.error("login route failed: ", error);
                res.status(400).json({error:"Login failed from the server login route"});
            }
        });
        
        app.post('/refresh-token', (req, res) => {
            const { accessToken } = req.body;
        
            // Check if refreshToken is provided
            if (!accessToken) {
                return res.status(401).json({error:"no token retrieved"}); // Unauthorized
            }
        
            // Verify the refresh token
            jwt.verify(accessToken, process.env.JWT_SECRET, (err, user) => {
                if (err) {
                    console.error("Invalid token:", err);
                    return res.status(201).json({ error: "Invalid token" }); // Forbidden
                }
        
                // Generate a new access token
                try {
                    const newAccessToken = jwt.sign(
                        { userId: user.userId, email: user.email },
                        process.env.JWT_SECRET,
                        { expiresIn: '24h' }
                    );
        
                    return res.status(200).json({ accessToken: newAccessToken }); // Respond with the new access token
                } catch (error) {
                    console.error("Error generating new access token:", error);
                    return res.status(500).json({ error: "Internal server error" }); // Handle token generation errors
                }
            });
        });
        
        app.get('/api', async (req, res) => {
            try {
                console.log("visited")
                const imagePath = join(__dirname, "public", "hlux.png");
        
                // Read the file as a buffer using fs/promises
                const imageBuffer = await fs.readFile(imagePath);
        
                // Set the appropriate content type
                res.set('Content-Type', 'image/png');
        
                // Send the image buffer
                res.status(200).send(imageBuffer);
            } catch (error) {
                console.error("API route failed: ", error);
                res.status(500).json({ error: "Failed to fetch the image." });
            }
        });
        app.get('/companyAdsLink',async (req,res)=>{
            try {
                const getUser=await Employee.findOne({email:req.session.email})
                if(getUser && getUser.companyId){
                    
                    const getCompany=await Company.findOne({serialId:getUser.companyId}).lean()
                    const companyAdsLink=getCompany.adsLink
                    res.status(200).json({companyAdsLink:companyAdsLink})
                }
                
            } catch (error) {
                console.error("companyAdsLink route failed: ",error)
                res.status(400).json({companyAdsLink:"none"})
            }
        })
        //test socket 
        wss.on('connection', function connection(ws, req) {
            try {
                var component=""
            ws.on('error', console.error);
            
            ws.on('message', function message(data) {
                // saveUserData({ userId:"louam123",password:"123" });
                const dataString = Buffer.from(data).toString('utf-8');
                // Parse the JSON data
                const finalData = JSON.parse(dataString);
                console.log("component",finalData);
                component=finalData.message
            });
                
            clearExistingCronJob(); // Clear any existing cron jobs

            // Schedule a new cron job
            currentCronJob =cron.schedule('2 * * * * *',async()=>{
                    console.log("server express cron is triggered..")
                    // fetch("https://type.fit/api/quotes")
                    // .then(function(response) {
                    // return response.json();
                    // })
                    // .then (async function(data) {
                    //   let newQuote=data[Math.floor(Math.random() * data.length)];
                    //   ws.send(JSON.stringify(
                    //   {text:newQuote.text,author:newQuote.author}))
                    //   console.log("new quote is sent..")
                    // })
                    // .catch((error)=>console.error("promise notification: ",error))
                    try {
                        const getUser=await Employee.findOne({email:req.session.email})
                        if(getUser){
                            let companySerialId=getUser.companyId;
                            let getCompany=await Company.findOne({serialId:companySerialId}).lean()
                            let randomOutput=returnRandomOutput([getCompany.events,getCompany.rules,getCompany.tasks,getCompany.urgents]) 
                            ws.send(JSON.stringify(
                            {text:randomOutput.split(",")[0],author:randomOutput.split(",")[1]}))
                            console.log("new quote is sent..")
                    }
                    } catch (error) {
                        console.error("cron failed: ",error)
                        
                  }})
            
            ws.on('close', () => {
                console.log('Client disconnected');
              });
            
              // Example: Send a message to the client every 5 seconds
              Company.watch().on('change', async(data) => {
                console.log("changes made: ",data)
                if(data.operationType=='update'){
                    const getUser=await Employee.findOne({email:req.session.email})
                    if(getUser){
                        let companySerialId=getUser.companyId;
                        let getCompany=await Company.findOne({serialId:companySerialId}).lean()
                        let getTasks = await Company.aggregate([
                            { $match: { serialId: companySerialId } }, // Match the specific company
                            { $unwind: "$tasks" },                     // Deconstruct the tasks array
                            { $match: { "tasks.employee": getUser.name } }, // Filter tasks by employee "Louam"
                            { $replaceRoot: { newRoot: "$tasks" } },   // Replace root with the tasks document
                            { $project: { _id: 0 } }                   // Optionally exclude the _id field
                        ]).exec();
                        
                          console.log("getTasks: ",getTasks)
                        let dataToSend={
                        events:getCompany.events.reverse(),
                        urgents:getCompany.urgents,
                        tasks:getTasks.reverse(),
                        voteSubject:getCompany.vote.subject
                        }
                        let updatedField=data.updateDescription.updatedFields
                        console.log(Object.keys(updatedField)[0])

                        if(Object.keys(updatedField)[0].match(/events/g)){
                            ws.send(JSON.stringify({events:dataToSend.events}));
                        console.log("events...")

                        }else if(Object.keys(updatedField)[0].match(/urgents/g)){
                            ws.send(JSON.stringify({urgents:dataToSend.urgents}));
                        console.log("urgents...")
                        
                        }else if(Object.keys(updatedField)[0].match(/tasks/g)){      
                            ws.send(JSON.stringify({tasks:dataToSend.tasks}));                       
                        console.log("tasks...")
                        
                        }else if(Object.keys(updatedField)[0].match(/vote/g)){
                            ws.send(JSON.stringify({voteSubject:dataToSend.voteSubject}));
                        console.log("vote...")
                        }
                    }   
                }
            });
            Employee.watch().on('change', async(data) => {
                console.log("changes made: ",data)
                if(data.operationType=='update'){
                    const getUser=await Employee.findOne({email:req.session.email})
                    let updatedField=data.updateDescription.updatedFields
                    if(Object.keys(updatedField)[0].match(/vote/g)){
                        let getCompany=await Company.findOne({serialId:getUser.companyId}).lean()
                        if(getCompany){
                            let companySerialId=getCompany.serialId;
                            //update vote result list and do stat : %,major result
                        }
                    console.log("vote employee...")
                    }
                    else if(Object.keys(updatedField)[0].match(/logedIn/g)){
                        console.log("logedIn...")
                        // const interfaces = os.networkInterfaces();
                        // console.log(interfaces)
                        // let ipsArray=[]
                        // Object.values(interfaces).forEach((inFace,i)=>{
                        //         console.log(inFace)
                        //         inFace.forEach((val)=>{
                        //             if (val.family === 'IPv4' && !val.internal) {
                        //                 console.log(val.address)
                        //                 ipsArray.push(val.address)
                        //             }
                        //         })
                        // })
                        // const connectedEmployee=await Employee.findOne({logedIn:true,connectedWithIps:{$in:ipsArray}})
                        const userData = await loadUserData();
                        if(userData!={}){
                            const connectedEmployee=await Employee.findOne({userId:userData.userId,password:userData.password})
                            
                            console.log('Loaded user data in server express after change stream: ', userData);
                            if(connectedEmployee!=null){
                                ws.send(JSON.stringify({loginInfo:"employee",name:connectedEmployee.name}))
                                req.session.email=connectedEmployee.email
                                console.log("connected employee from checkLgin route: ",connectedEmployee)
                            }else{
                                ws.send(JSON.stringify({loginInfo:"none"}))
                            }
                        };
                        
                    }
                }
            })
            } catch (error) {
              console.error("web socket failed: ",error);  
            }
          });
        //vote post route
        app.post('/vote',async(req,res)=>{
            try {
                const {vote}=req.body
            let subjectVote=''
            console.log("vote route triggered: ",vote)
            const getUser=await Employee.findOne({email:req.session.email})
            console.log(getUser)
            if(getUser){
                const getCompany=await Company.findOneAndUpdate({serialId:getUser.companyId},
                    {$push:{"vote.result":vote},$inc:{"vote.numberOfVotes":1}},{new:true}
                )
                console.log(getCompany)
                res.json({subject:getCompany.vote.subject,vote:vote});
            }
            } catch (error) {
             console.error("vote route failed: ",error);   
            }
        })
        //search route
        app.get('/search',async(req,res)=>{
            try {
                const {search}=req.query;
                console.log("search: ",search);
                const getUser=await Employee.findOne({email:req.session.email})
                if(getUser){
                    let companySerialId=getUser.companyId;
                    let team=getUser.team;
                    let getRessources = await Company.aggregate([
                        {
                            $match: { serialId: companySerialId } // Match the company with the given serialId
                        },
                        {
                            $unwind: "$tasks" // Unwind the tasks array to work with individual task documents
                        },
                        {
                            $match: { // Match tasks where team and name match the provided values
                                "tasks.team": team,
                                "tasks.name": { $regex: search, $options: "i" }
                            }
                        },
                        {
                            $project: { // Project only the relevant fields from the tasks
                                _id: 0,
                                name: "$tasks.name",
                                team: "$tasks.team",
                                ressources: "$tasks.ressources",
                                details: "$tasks.details"
                            }
                        }
                    ]);
                    console.log("getRessources: ",getRessources)
                    res.json({ressourcesList:getRessources.reverse()});
                }
            }catch(error){
                console.error("search route failed: ",error);
                
            }
    })  
    app.get('/checkLogin', verifyToken, async (req, res) => {
        try {
            console.log("req.user.email: ",req.user.email)
          const connectedEmployee = await Employee.findOne({ email: req.user.email });
          if (connectedEmployee != null) {
            req.session.email=req.user.email;
            res.status(200).json({ loginInfo: "employee", name: connectedEmployee.name });
            console.log("connected employee from checkLgin route: ",connectedEmployee)
          } else {
            res.status(201).json({ loginInfo: "none" });
            console.log("no connected employee from checkLgin route: ")
          }
        } catch (error) {
          console.error("checkLogin route failed: ", error);
          res.status(500).json({message:"Internal server error"});
        }
      });
      
        //notification employee
        app.get('/notification-starter-employee',async(req,res)=>{
            try {
                console.log("req.session.email: get ",req.session.email)
            const findEmployee=await Employee.findOne({email:req.session.email})
            console.log("employee found in notification started route: ",findEmployee)
            if(findEmployee){
            const companySerialId=findEmployee.companyId
            console.log("companySerialId: ",companySerialId)
            let getTasks = await Company.aggregate([
                { $match: { serialId: companySerialId } }, // Match the specific company
                { $unwind: "$tasks" },                     // Deconstruct the tasks array
                { $match: { "tasks.employee": findEmployee.name } }, // Filter tasks by employee "Louam"
                { $replaceRoot: { newRoot: "$tasks" } },   // Replace root with the tasks document
                { $project: { _id: 0 } }                   // Optionally exclude the _id field
            ]).exec();
            
              console.log("getTasks: ",getTasks)
            const rule=await Company.findOne({serialId:companySerialId}).lean()
            console.log(rule.rules)
            res.json({rule:rule.rules,events:rule.events.reverse(),urgents:rule.urgents.reverse(),tasks:getTasks.reverse()})
            }
            } catch (error) {
             console.error("notification starter employee route failed: ",error);   
            }
        })
        app.get('/events', (req, res) => {
            try {
                res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            //change stream for companies
            Company.watch().on('change', async(data) => {
                console.log("changes made: ",data)
                if(data.operationType=='update'){
                    const getUser=await Employee.findOne({email:req.session.email})
                    if(getUser){
                        let companySerialId=getUser.companyId;
                        let getCompany=await Company.findOne({serialId:companySerialId}).lean()
                        let getTasks = await Company.aggregate([
                            { $match: { serialId: companySerialId } }, // Match the specific company
                            { $unwind: "$tasks" },                     // Deconstruct the tasks array
                            { $match: { "tasks.employee": getUser.name } }, // Filter tasks by employee "Louam"
                            { $replaceRoot: { newRoot: "$tasks" } },   // Replace root with the tasks document
                            { $project: { _id: 0 } }                   // Optionally exclude the _id field
                        ]).exec();
                        
                          console.log("getTasks: ",getTasks)
                        let dataToSend={
                        events:getCompany.events.reverse(),
                        urgents:getCompany.urgents,
                        tasks:getTasks.reverse(),
                        voteSubject:getCompany.vote.subject
                        }
                        let updatedField=data.updateDescription.updatedFields
                        console.log(Object.keys(updatedField)[0])

                        if(Object.keys(updatedField)[0].match(/events/g)){
                        res.write(JSON.stringify({events:dataToSend.events}));
                        console.log("events...")
                        console.log(Object.values(updatedField)[0])
                        }else if(Object.keys(updatedField)[0].match(/urgents/g)){
                            res.write({urgents:dataToSend.urgents});
                        console.log("urgents...")
                        }else if(Object.keys(updatedField)[0].match(/tasks/g)){
                            res.write({tasks:dataToSend.tasks});
                        console.log("tasks...")
                        }else if(Object.keys(updatedField)[0].match(/vote/g)){
                            res.write({voteSubject:dataToSend.voteSubject,
                                userChoice:getUser.vote});
                        console.log("vote...")
                        }
                        
                    }   
                }
      });
            req.on('close', () => {
              
              res.end();
            });
            } catch (error) {
               console.error("events route failed: ",error); 
            }
          }); 
        } catch (err) {
          console.error(err);
      }
    })

    server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
