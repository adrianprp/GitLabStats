'use strict';
import { GitLab }  from './gitLabClass.js';
import { ChartGenerator } from './chartScript.js';
import  moment  from 'moment';
import  momentBDays   from 'moment-business-days';

const params = {
  token : process.env.GITLAB_TOKEN,
  url : process.env.GITLAB_URL,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS
};

const PROJECT_IDS = ['2282', '2061', '2523', '2070'];

// Weekly Span of time.
const startDate = new Date('05/22/2023 08:00');
const endDate = new Date('05/29/2023 20:00');

// Monthly Span of time.
const startOfYearDate = new Date('01/01/2023 08:00');
const startDateCurrentMonth = new Date('05/01/2023 08:00')
const presentDate = moment();

const RequestHeaders = {
  "Accept": "application/json",
  "Authorization": `Bearer ${params.token}`,
};

const mergeRequestPromises = [];
const yearToDateMergeRequests = [];
const notesPromises = [];
const disscusionsPromises = [];

let mergeRequests = [];
let yearToDateMrs = [];

let approvals;
let comments;

let timeSpentInCodeReview;
let averageTime;
let averageYearToStartOfMonth;
let deltaAverageTime;
let feedbackTimes = [];
let averageFeedbackTime;
let codeReview;

const gitLab = new GitLab(params.url, RequestHeaders);


PROJECT_IDS.forEach(id => yearToDateMergeRequests.push(gitLab.getMergeRequests(id, startOfYearDate.toISOString(), presentDate.toISOString())));

// Get the merge requests made in the specified time frame, for all of the projects.
PROJECT_IDS.forEach(id => mergeRequestPromises.push(gitLab.getMergeRequests(id, startDate.toISOString(), endDate.toISOString())));

Promise.all(yearToDateMergeRequests)
  .then((mergeRequests) => {
    yearToDateMrs = formatMergeRequests(mergeRequests);

    const yearToStartOfMonthMrs = yearToDateMrs.filter(mr => {
     let date = moment(mr.createdAt);
      return date.month() !== startDateCurrentMonth.getMonth();
    });

    averageYearToStartOfMonth = formatTime(calcAverageTime(yearToDateMrs));

    deltaAverageTime = formatTime(calcAverageTime(yearToDateMrs) - calcAverageTime(yearToStartOfMonthMrs));

    return Promise.all(mergeRequestPromises);
})
  .then((allMergeRequests) => {

  mergeRequests  = formatMergeRequests(allMergeRequests);

  return new Promise((resolve, _) => {
    mergeRequests.forEach(mr => notesPromises.push(gitLab.getNotes(mr.projectId, mr.id)));
    resolve(Promise.all(notesPromises));
  })
})
  .then(notes => { 
    // Set approvals
    approvals = setApprovals(notes);

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
    // Calc average feedback time
    averageFeedbackTime = calcAverageFeedbackTime();

    return new Promise((resolve, _) => {
      mergeRequests.forEach(mr => disscusionsPromises.push(gitLab.getDiscussions(mr.projectId, mr.id)));
      resolve(Promise.all(notesPromises));
    })
  })
  .then(disscusions => {
    // Set comments
    comments = setComments(disscusions);

    codeReview = {
      "Period": `${startDate} - ${endDate}`,
      "Average Time year to start of month": averageYearToStartOfMonth  ,
      "Delta Average Time - this month": deltaAverageTime,
      "Average Feedback Time": averageFeedbackTime,
      approvals : approvals,
      comments: comments
    }    

    console.log(codeReview)
    //Create the Graphs
    const approvalsGenerator = new ChartGenerator(codeReview.approvals, 'Approvals');
    approvalsGenerator.createChart();

    const commentsGenerator = new ChartGenerator(codeReview.comments, 'Comments');
    commentsGenerator.createChart();
  })


  const formatMergeRequests = (mergeRequests) => {
   return mergeRequests
    .flat(2)
    .map(mr => { 
      timeSpentInCodeReview = calcTimeSpent(mr.created_at, mr.merged_at);

      return { 
        id: mr.iid, 
        projectId: mr.project_id, 
        author: mr.author.name,
        timeInCodeReview: formatTime(timeSpentInCodeReview),
        createdAt: mr.created_at,
        mergedAt: mr.merged_at
       }})
  }

  const calcAverageTime = (listOfMrs) => {
    let notYetMerged = 0;
    // Get the average time a MR spends in CR
    let totalTime = listOfMrs.reduce((acc, curr) => {
      if (curr.timeInCodeReview == "Not yet merged") {
        notYetMerged++;
        return acc;
      }
      let timeSpent = calcTimeSpent(curr.createdAt, curr.mergedAt);
      return acc + timeSpent;
    }, 0);

    return totalTime / (listOfMrs.length - notYetMerged);
  }

  const calcAverageFeedbackTime = () => {
    let notInteractedWith = 0;
    let totalFeedbackTime = feedbackTimes.reduce((acc, curr) => {

      if (curr == null) {
        notInteractedWith++;
        return acc;
      }
      return  acc + curr.feedbackTime;
    }, 0);

    return formatTime(totalFeedbackTime / (feedbackTimes.length - notInteractedWith));
  }

 const setApprovals = (notes) => {
  let approvals = [];
  const eligibleAuthors = ['Sebastian Strulea', 'Adrian Pripon', 'Dragos Bodea', 'Raul Vasile', 'Catalin Poclid', 'Cristian Taloi', 'Panu Umbangtalad'];

  approvals = notes.flat(2)
      .filter(note => note.body == 'approved this merge request' && eligibleAuthors.includes(note.author.name))
      .map(note => { 
        return  { name: note.author.name, id: note.author.id }
      });
  return countAndFormat(approvals)
 }

  const setComments = (disscusions) => {
    let comments = [];
    // This may be improved by using the /discussions endpoint.
    // Some comments may be lost as they have type null even tho they are a comment. Need to test more.
    comments =  disscusions.flat(2)
      .filter(disscusion => isActualComment(disscusion))
      .map(disscusion => {
       return { name:disscusion.author.name, id: disscusion.author.id, body: disscusion.body }
      });
    return countAndFormat(comments);
  }


  // ------ Helper Functions ------ 
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