'use strict';
import { GitLab }  from './gitLabClass.js';
import  moment  from 'moment';
import  momentBDays   from 'moment-business-days';

const params = {
  token : process.env.GITLAB_TOKEN,
  url : process.env.GITLAB_URL
};

const PROJECT_IDS = ['2282', '2061', '2523', '2070'];

const endDate = new Date();
const last5Days = moment().subtract(5, 'days');
const lastMonth = moment().subtract(1, 'month');

const startDateTest = new Date('05/01/2023');
const endDateTest = new Date('05/06/2023');

const RequestHeaders = {
  "Accept": "application/json",
  "Authorization": `Bearer ${params.token}`,
};

const mergeRequestPromises = [];
const notesPromises = [];

let mergeRequests = [];
let approvals = [];
let comments = [];

let approvalsMap;
let commentsMap;

let timeSpentInCodeReview;
let averageTime;
let codeReview;

const gitLab = new GitLab(params.url, RequestHeaders);

// Get the merge requests made in the specified time frame, for all of the projects.
PROJECT_IDS.forEach(id => mergeRequestPromises.push(gitLab.getMergeRequests(id, startDateTest.toISOString(), endDateTest.toISOString())));

Promise.all(mergeRequestPromises)
  .then((allMergeRequests) => {

  let listOfMrs =  allMergeRequests.flat(2).filter(mr => mr.merged_at != null);
  averageTime = formatTime(listOfMrs
    .reduce((acc, curr) => {
      let timeSpent = calcTimeSpent(curr.created_at, curr.merged_at);
      return acc + +timeSpent.diff;
    }, 0) / listOfMrs.length);

  mergeRequests = allMergeRequests
    .flat(2)
    // .filter( mr => new Date(mr.created_at) > startDateTest )
    .map(mr => { 
      timeSpentInCodeReview = calcTimeSpent(mr.created_at, mr.merged_at);

      return { id: mr.iid, projectId: mr.project_id, timeInCodeReview: timeSpentInCodeReview } 
  });

  return new Promise((resolve, _) => {
    mergeRequests.forEach(mr => notesPromises.push(gitLab.getNotes(mr.projectId, mr.id)));
    resolve( Promise.all(notesPromises));
  })
})
  .then(notes => { 
    approvals = notes.flat(2)
      .filter(note => note.body == 'approved this merge request' || note.body == 'unapproved this merge request')
      .map(note => { 
        return  { name: note.author.name, id: note.author.id }
      });
    approvalsMap = countAndFormat(approvals)

    comments = notes.flat(2)
      .filter(note => isActualComment(note))
      .map(note => {
       return { name:note.author.name, id: note.author.id, b: note.body }
      });
    commentsMap = countAndFormat(comments);

    codeReview = {
      timeInterval: `${startDateTest} - ${endDateTest}`,
      approvals : approvalsMap,
      comments: commentsMap
    }

    console.log(codeReview);
  });


const countAndFormat = (array) => {
  return array.reduce((acc, curr) => {
    const { id, name } = curr;
    const key = name;
    if (key in acc) {
      acc[key].count += 1;
    } else {
      acc[key] = { id, count: 1 };
    }
    return acc;
  }, {});
}


  // Time Helper Functions
const calcTimeSpent = (createdAt, mergedAt) => {
  if (mergedAt == null) return null;

  momentBDays.updateLocale('ro', {
    workingWeekdays: [1, 2, 3, 4, 5]
  });

  const time =  moment(mergedAt).businessDiff(moment(createdAt));
  return formatTime(time);
}

const formatTime = (time) => {
  const duration = moment.duration(time);
  return { days: duration.asDays(), hours: duration.asHours(), minutes: duration.asMinutes(), diff: time };
}

  // Comments Helper functions
const isActualComment = (note) => {
  // Check if the note is not a system-generated note
  if (
    note.system ||
    !(note.type === "Discussion" || note.type === "DiffNote" || note.type === "DiscussionNote")
  ) {
    return false;
  }

  // Check if the comment is meaningful
  const minLength = 10;
  const isValidLength = note.body.trim().length >= minLength;
  return isValidLength;
};
  