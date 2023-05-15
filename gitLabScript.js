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
const startDate = new Date('05/01/2023');
const endDate = new Date('05/08/2023');

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
  let listOfMrs =  allMergeRequests.flat(2).filter(mr => mr.merged_at != null);
  averageTime = formatTime(listOfMrs 
  .reduce((acc, curr) => {
    let timeSpent = calcTimeSpent(curr.created_at, curr.merged_at);
    return acc + timeSpent;
  }, 0) / listOfMrs.length);

  mergeRequests = allMergeRequests
    .flat(2)
    .map(mr => { 
      timeSpentInCodeReview = calcTimeSpent(mr.created_at, mr.merged_at,  mr.iid);

      return { 
        id: mr.iid, 
        projectId: mr.project_id, 
        author: mr.author.name,
        timeInCodeReview: formatTime(timeSpentInCodeReview) } 
  });

  return new Promise((resolve, _) => {
    mergeRequests.forEach(mr => notesPromises.push(gitLab.getNotes(mr.projectId, mr.id)));
    resolve(Promise.all(notesPromises));
  })
})
  .then(notes => { 
    // Set approvals
    approvals = notes.flat(2)
      .filter(note => note.body == 'approved this merge request' || note.body == 'unapproved this merge request')
      .map(note => { 
        return  { name: note.author.name, id: note.author.id }
      });
    approvalsMap = countAndFormat(approvals)

    // Set comments
    comments = notes.flat(2)
      .filter(note => isActualComment(note))
      .map(note => {
       return { name:note.author.name, id: note.author.id, b: note.body }
      });
    commentsMap = countAndFormat(comments);

    // Feekback Time
    feedbackTimes = mergeRequests.map(mr => {
      const validNotes = notes
        .flat(2)
        .filter(note => isValidNote(note, mr))

      // console.log(validNotes);s

      if (validNotes.length > 0) {
        validNotes.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
      // console.log(validNotes[0])
      }

    });




    codeReview = {
      timeInterval: `${startDate} - ${endDate}`,
      approvals : approvalsMap,
      comments: commentsMap
    }

    console.log(averageTime);
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
  const calcTimeSpent = (createdAt, mergedAt, id) => {
    if (mergedAt == null) return null;

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
    if (milliseconds == null) return 'Not yet merged';
    // return moment.duration(milliseconds).humanize()
    const duration = moment.duration(milliseconds);
    return { 
      days: duration.get('days'),
      hours: duration.get('hours'),
      mins: duration.get('minutes') 
    }
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

  // Notes Helper functions

  const isValidNote = (note, mr) => {
    const isApprovalRelated = note.body.includes('approved this merge request') || note.body.includes('unapproved this merge request');

    if (!note.system || isApprovalRelated) {
      return note.author.username !== mr.author;
    }

    return false;
  }


  
  
