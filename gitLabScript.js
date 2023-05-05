'use strict';
import { GitLab } from './gitLabClass.js';
import  moment  from 'moment';

const params = {
  token : process.env.GITLAB_TOKEN,
};

const GITLAB_URL = 'https://git.everymatrix.com/api/v4';
const PROJECT_IDS = ['2282', '2061', '2523', '2070'];

const endDate = new Date();
const last5Days = moment().subtract(5, 'days');
const lastMonth = moment().subtract(1, 'month');

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

const gitLab = new GitLab(GITLAB_URL, RequestHeaders);

// Get the merge requests made in the specified time frame, for all of the projects.
PROJECT_IDS.forEach(id => mergeRequestPromises.push(gitLab.getMergeRequests(id, lastMonth.toISOString(), endDate.toISOString())));

Promise.all(mergeRequestPromises)
  .then((allMergeRequests) => {

  let listOfMrs =  allMergeRequests.flat(2).filter(mr => mr.merged_at != null);
  averageTime = formatTime(listOfMrs
    .reduce((acc, curr) => {
      let timeSpent = calculateTimeSpent(curr.created_at, curr.merged_at);
      return acc + +timeSpent.diff;
    }, 0) / listOfMrs.length);

  mergeRequests = allMergeRequests
    .flat(2)
    .filter( mr => new Date(mr.created_at) > last5Days )
    .map(mr => { 
      timeSpentInCodeReview = calculateTimeSpent(mr.created_at, mr.merged_at);

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

    // @TODO: for business purposes Discussion, DiffNote or DiscussionNote could be excluded to not muddle the data.
    comments = notes.flat(2)
      .filter(note => note.type == 'Discussion' || note.type ==  'DiffNote' ||  note.type == 'DiscussionNote')
      .map(note => {
       return { name:note.author.name, id: note.author.id }
      });
    commentsMap = countAndFormat(comments);
      
    codeReview = {
      approvals : approvalsMap,
      comments: commentsMap
    }

  console.log(codeReview, averageTime )
  });


const countAndFormat = (array) => {
  return array.reduce((acc, curr) => {
    const { id, name } = curr;
    const key = name;
    if (key in acc) {
      acc[key].count += 1;
    } else {
      acc[key] = { id, name, count: 1 };
    }
    return acc;
  }, {});
}

const calculateTimeSpent = (createdAt, mergedAt) => {
  if (mergedAt == null) return null;
  const time =  moment(mergedAt).diff(moment(createdAt));
  return formatTime(time);
}

const formatTime = (time) => {
  const duration = moment.duration(time);

  return { days:duration.asDays(), hours: duration.asHours(), minutes: duration.asMinutes(), diff: time };
}
