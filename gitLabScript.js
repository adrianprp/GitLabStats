'use strict';
import { GitLab }  from './gitLabClass.js';
import  moment  from 'moment';
import  momentBDays   from 'moment-business-days';

const params = {
  token : process.env.GITLAB_TOKEN,
  url : process.env.GITLAB_URL
};

const PROJECT_IDS = ['2282', '2061', '2523', '2070'];

// Span of time
const startDate = new Date('05/08/2023 08:00');
const endDate = new Date('05/15/2023 20:00');

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
let feedbackTimes = [];
let averageFeedbackTime;
let codeReview;

const gitLab = new GitLab(params.url, RequestHeaders);

// Get the merge requests made in the specified time frame, for all of the projects.
PROJECT_IDS.forEach(id => mergeRequestPromises.push(gitLab.getMergeRequests(id, startDate.toISOString(), endDate.toISOString())));

Promise.all(mergeRequestPromises)
  .then((allMergeRequests) => {


  // Get the average time a MR spends in CR
  let listOfMrs =  allMergeRequests.flat(2).filter(mr => mr.merged_at !== null);
  averageTime = formatTime(listOfMrs 
  .reduce((acc, curr) => {
    let timeSpent = calcTimeSpent(curr.created_at, curr.merged_at);
    return acc + timeSpent;
  }, 0) / listOfMrs.length);

  mergeRequests = allMergeRequests
    .flat(2)
    .map(mr => { 
      timeSpentInCodeReview = calcTimeSpent(mr.created_at, mr.merged_at);

      return { 
        id: mr.iid, 
        projectId: mr.project_id, 
        author: mr.author.name,
        timeInCodeReview: formatTime(timeSpentInCodeReview),
        createdAt: mr.created_at } 
  });

  return new Promise((resolve, _) => {
    mergeRequests.forEach(mr => notesPromises.push(gitLab.getNotes(mr.projectId, mr.id)));
    resolve(Promise.all(notesPromises));
  })
})
  .then(notes => { 
    // Set approvals
    approvals = notes.flat(2)
      .filter(note => note.body == 'approved this merge request')
      .map(note => { 
        return  { name: note.author.name, id: note.author.id }
      });
    approvalsMap = countAndFormat(approvals)

    // Set comments
    // This may be improved by using the /discussions endpoint.
    // Some comments may be lost as they have type null even tho they are a comment. Need to test more.
    comments = notes.flat(2)
      .filter(note => isActualComment(note))
      .map(note => {
       return { name:note.author.name, id: note.author.id, body: note.body }
      });
    commentsMap = countAndFormat(comments);

    // Feekback Time
    feedbackTimes = mergeRequests.map((mr, i) => {

      const validNotes = notes[i]
        .filter(note => isValidNote(note, mr))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
      const firstValidNote = validNotes[0];
  
      if (firstValidNote) {
        const timeSpent = calcTimeSpent(mr.createdAt, firstValidNote.created_at);
        return {
          mrId: mr.id, 
          noteId: firstValidNote.id, 
          feedbackTime: timeSpent
        };
      }
      // If no valid note exists, return null
      return null;
    });
  
    // Remove null values if any exist
    feedbackTimes = feedbackTimes.filter(time => time !== null);

    // Calc average feedback time
    averageFeedbackTime = formatTime(feedbackTimes.reduce((acc, curr) => {
      return  acc + curr.feedbackTime;
    }, 0) / feedbackTimes.length);



    codeReview = {
      timeInterval: `${startDate} - ${endDate}`,
      averageTimeInCR: averageTime,
      averageFeedbackTime: averageFeedbackTime,
      approvals : approvalsMap,
      comments: commentsMap
    }
    console.log(codeReview);
  });


  const countAndFormat = (array) => {
    return array.reduce((acc, curr) => {
      const { id, name } = curr;
      const key = name.split(" ")[0];
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
    if (mergedAt === null) return null;

    const created = moment(createdAt);
    const merged = moment(mergedAt);

    if (created.day() == merged.day()) {
      let timeSpent = merged.diff(created);
      return timeSpent;
    } 
    return businessDaysDifference(created, merged) * 86400000;
  }

  const businessDaysDifference = (startDate, endDate) => {
    momentBDays.updateLocale('ro', {
      workingWeekdays: [1, 2, 3, 4, 5]
    });
    let businessDays = 0;
    let current = startDate.clone();

    while (current.isBefore(endDate)) {
      if (current.isBusinessDay()) {
        businessDays++;
      }
      current.add(1, 'day');
    }

    const remainingHours = endDate.diff(current.subtract(1, 'day'), 'hours', true);
    const fractionalDay = remainingHours / 24;

    return businessDays + fractionalDay;
  }


  const formatTime = (milliseconds) => {
    if (milliseconds === null) return 'Not yet merged';
    // return moment.duration(milliseconds).humanize()
    const duration = moment.duration(milliseconds);
    return { 
      days: duration.get('days'),
      hours: duration.get('hours'),
      mins: duration.get('minutes') 
    }
  }

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

  const isValidNote = (note, mr) => {
    // A valid note for feedback time, is a note created by another team member, non system, unless is the one about approving a MR.
    return (!note.system && note.author.name !== mr.author) || 
    (note.author.name !== mr.author && 
    (note.body.includes('approved this merge request') || 
    note.body.includes('unapproved this merge request')));
  }