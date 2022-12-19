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
      console.log("Server Running at http://localhost:3001/")
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
  //const { search_q = "", limit, offset, desc } = request.query;
  const getLoggedInUserId = `SELECT user_id FROM user WHERE username = '${request.username}'`;
  const userId = await database.get(getLoggedInUserId);
  const getTweetsQuery = `
    SELECT
        username, tweet, date_time AS dateTime
    FROM
        (user INNER Join tweet ON user.user_id = tweet.user_id) AS new INNER JOIN follower ON new.user_id = follower.follower_id
     WHERE
        follower_user_id = ${userId.user_id}
    ORDER BY
        date_time DESC
    LIMIT 
        4
    OFFSET 
        0;`;
  const tweets = await database.all(getTweetsQuery);
  response.send(tweets);
});

app.get("/user/following/", authentication, async (request, response) => {
  //const { userId } = request.params;

  const getLoggedInUserId = `SELECT user_id FROM user WHERE username = '${request.username}'`;
  const userId = await database.get(getLoggedInUserId);
  console.log(userId.user_id);

  const getFollowingUserNamesQuery = `
    SELECT
        name
    FROM
        user INNER JOIN follower ON user.user_id = follower.follower_id
    WHERE
        following_user_id = ${userId.user_id}`;
  const following = await database.all(getFollowingUserNamesQuery);
  response.send(following);
});

app.get("/user/followers/", authentication, async (request, response) => {
  const getLoggedInUserId = `SELECT user_id FROM user WHERE username = '${request.username}'`;
  const userId = await database.get(getLoggedInUserId);

  const getFollowersNamesQuery = `
    SELECT 
        name
    FROM
        user INNER JOIN follower ON user.user_id = follower.follower_id
    WHERE
        follower_user_id = ${userId[0].user_id}`;
  const followers = await database.all(getFollowersNamesQuery);
  response.send(followers);
});

app.get("/user/", async (request, response) => {
  const getFollowers = `SELECT * FROM tweet`;
  const followers = await database.all(getFollowers);
  response.send(followers);
});

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const getLoggedInUserId = `SELECT user_id FROM user WHERE username = '${request.username}'`;
  const userId = await database.get(getLoggedInUserId);

  const getFollowingUserTweetId = `SELECT tweet_id FROM (user INNER JOIN tweet ON user.user_id = tweet.user_id) AS new INNER JOIN follower ON new.user_id = follower.follower_id WHERE follower_user_id = ${userId.user_id}`;
  const tweetIdUser = await database.all(getFollowingUserTweetId);
  console.log(tweetIdUser.map((each) => each.tweet_id));
  const tweetIdArray = tweetIdUser.map((each) => each.tweet_id);

  const { tweetId } = request.params;
  console.log(typeof tweetId);

  console.log(tweetIdArray.includes(tweetId));
  if (tweetIdArray.includes(parseInt(tweetId))) {
    const getLikesQuery = `SELECT * FROM like WHERE tweet_id = ${tweetId}`;
    const likes = await database.all(getLikesQuery);

    const getReplyQuery = `SELECT * FROM reply WHERE tweet_id = ${tweetId}`;
    const replies = await database.all(getReplyQuery);

    console.log(likes.length);

    const getTweetsAndLikesQuery = `
        SELECT
            tweet, date_time
        FROM
            tweet
        WHERE 
            tweet_id = ${tweetId}`;
    const tweets = await database.get(getTweetsAndLikesQuery);
    console.log(tweets);
    response.send({
      tweet: tweets.tweet,
      likes: likes.length,
      replies: replies.length,
      dateTime: tweets.date_time,
    });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const getLoggedInUserId = `SELECT user_id FROM user WHERE username = '${request.username}'`;
    const userId = await database.get(getLoggedInUserId);
    const { tweetId } = request.params;

    const getFollowingUserTweetId = `SELECT tweet_id FROM (user INNER JOIN tweet ON user.user_id = tweet.user_id) AS new INNER JOIN follower ON new.user_id = follower.follower_id WHERE follower_user_id = ${userId.user_id}`;
    const tweetIdUser = await database.all(getFollowingUserTweetId);
    // console.log(tweetIdUser.map((each) => each.tweet_id));
    //console.log(tweetIdArray);
    const tweetIdArray = tweetIdUser.map((each) => parseInt(each.tweet_id));

    if (tweetIdArray.includes(parseInt(tweetId))) {
      const getLikedUsersQuery = `
        SELECT
            username
        FROM
            user Natural Join like
        WHERE
            tweet_id = ${tweetId}`;
      const usernames = await database.all(getLikedUsersQuery);
      response.send({ likes: usernames });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const getLoggedInUserId = `SELECT user_id FROM user WHERE username = '${request.username}'`;
    const userId = await database.get(getLoggedInUserId);
    const { tweetId } = request.params;

    const getFollowingUserTweetId = `SELECT tweet_id FROM (user INNER JOIN tweet ON user.user_id = tweet.user_id) AS new INNER JOIN follower ON new.user_id = follower.follower_id WHERE follower_user_id = ${userId.user_id}`;
    const tweetIdUser = await database.all(getFollowingUserTweetId);
    // console.log(tweetIdUser.map((each) => parseInt(each.tweet_id)));
    const tweetIdArray = tweetIdUser.map((each) => parseInt(each.tweet_id));

    if (tweetIdArray.includes(parseInt(tweetId))) {
      const getReplyUsersQuery = `
        SELECT
            name, reply
        FROM
            user NATURAL JOIN reply
        WHERE 
            tweet_id = ${tweetId}`;
      const userReplies = await database.all(getReplyUsersQuery);
      response.send({ replies: userReplies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authentication, async (request, response) => {
  const getLoggedInUserId = `SELECT user_id FROM user WHERE username = '${request.username}'`;
  const userId = await database.get(getLoggedInUserId);

  const getTweetQuery = `SELECT tweet, date_time, tweet_id FROM tweet WHERE user_id = ${userId.user_id}`;
  const userTweets = await database.all(getTweetQuery);

  //const getTweetIdQuery = `SELECT tweet_id FROM tweet`
  console.log(userTweets.map((each) => each.tweet_id));
  const getLikesQuery = `SELECT * FROM like WHERE tweet_id = ${
    userTweets.map((each) => each.tweet_id)[1]
  }`;
  const likes = await database.all(getLikesQuery);
  console.log(likes);
  const getReplyQuery = `SELECT * FROM reply WHERE tweet_id = ${
    userTweets.map((each) => each.tweet_id)[1]
  }`;
  const replies = await database.all(getReplyQuery);
  console.log(replies);
  const getDateTimeQuery = `SELECT * FROM user WHERE user_id = ${userId.user_id}`;
  const dateTime = await database.all(getDateTimeQuery);
  //response.send(tweets);
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
  const getLoggedInUserId = `SELECT user_id FROM user WHERE username = '${request.username}'`;
  const userId = await database.get(getLoggedInUserId);

  const getFollowingUserTweetId = `SELECT tweet_id FROM (user INNER JOIN tweet ON user.user_id = tweet.user_id) AS new INNER JOIN follower ON new.user_id = follower.follower_id WHERE follower_user_id = ${userId.user_id}`;
  const tweetIdUser = await database.all(getFollowingUserTweetId);
  // console.log(tweetIdUser.map((each) => parseInt(each.tweet_id)));
  const tweetIdArray = tweetIdUser.map((each) => parseInt(each.tweet_id));

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
