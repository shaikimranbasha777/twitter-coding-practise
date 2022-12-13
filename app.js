const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3001, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "joe_Biden", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await database.get(selectUserQuery);

  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        )`;
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const dbResponse = await database.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "joe_Biden");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { search_q = "", limit, offset, desc } = request.query;
  const { username, userId } = request.body;
  const getTweetsQuery = `
    SELECT
        username, tweet, date_time
    FROM
        user Natural Join tweet AS T NATURAL JOIN follower
    WHERE
        follower_user_id = ${userId}
    LIMIT 
        ${limit} 
    ORDERBY 
        ${desc}
    OFFSET 
        ${offset};`;
  const tweets = await database.get(getTweetsQuery);
  response.send(tweets);
});

app.get("/user/following/", authentication, async (request, response) => {
  const { userId } = request.query;
  const getFollowingUserNamesQuery = `
    SELECT
        name
    FROM
        user INNER JOIN follower ON user.user_id = follower.follower_id
    WHERE
        following_user_id = ${userId}`;
  const following = await database.all(getFollowingUserNamesQuery);
  response.send(following);
});

app.get("/user/followers/", authentication, async (request, response) => {
  const getFollowersNamesQuery = `
    SELECT 
        name
    FROM
        user`;
  const followers = await database.all(getFollowersNamesQuery);
  response.send(followers);
});

app.get("/user/", async (request, response) => {
  const getFollowers = `SELECT * FROM tweet`;
  const followers = await database.all(getFollowers);
  response.send(followers);
});

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  if (tweetId === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetsAndLikesQuery = `
        SELECT
            tweet, 
            COUNT(like_id) AS likes,
            COUNT(reply) AS replies,
            date_time AS dateTime
        FROM
            (tweet NATURAL JOIN reply) AS T NATURAL JOIN like
        WHERE 
            tweet_id = ${tweetId}`;
    const tweets = await database.all(getTweetsAndLikesQuery);
    response.send(tweets);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { tweetId } = request.params;
    if (tweetId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikedUsersQuery = `
        SELECT
            username
        FROM
            user NATURAL JOIN like
        WHERE 
            tweet_id = ${tweetId}`;
      const usernames = await database.all(getLikedUsersQuery);
      response.send({ likes: usernames });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const { tweetId } = request.params;
    if (tweetId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getReplyUsersQuery = `
        SELECT
            name, reply
        FROM
            user NATURAL JOIN reply
        WHERE 
            tweet_id = ${tweetId}`;
      const userReplies = await database.all(getReplyUsersQuery);
      response.send({ replies: userReplies });
    }
  }
);

app.get("/user/tweets/", authentication, async (request, response) => {
  const getUserTweetsQuery = `
    SELECT
            tweet, 
            COUNT(like_id) AS likes,
            COUNT(reply) AS replies,
            date_time AS dateTime
        FROM
            (tweet NATURAL JOIN reply) AS T NATURAL JOIN like`;
  const tweets = await database.all(getUserTweetsQuery);
  response.send(tweets);
});

app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet, tweetId, userId, dateTime } = request.body;
  const postTweetQuery = `
  INSERT INTO
    tweet(tweet)
  VALUES(
      '${tweet}'
  )`;
  const newTweet = await database.run(postTweetQuery);
  newTweet.lastId;
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  if (tweetId === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetsAndLikesQuery = `
        DELETE FROM
            tweet
        WHERE 
            tweet_id = ${tweetId}`;
    const tweets = await database.all(deleteTweetsAndLikesQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
