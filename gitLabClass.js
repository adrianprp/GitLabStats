'use strict';
import fetch from 'node-fetch';

export class GitLab {

	constructor(url, headers) {
		this.url = new URL(url);
		this.headers = headers;
	}

	getMergeRequests(projectId, startDate, endDate) {
	
		const fetchPage = (page) => {
			return new Promise((resolve, reject) => {
				fetch(
					`${this.url}api/v4/projects/${projectId}/merge_requests?created_after=${startDate}&created_before=${endDate}&per_page=100&page=${page}`,	{ headers: this.headers }
				)
					.then((res) => {
					const totalPages = parseInt(res.headers.get('X-Total-Pages'), 10);
	
					return res.json().then((mergeRequests) => {
							if (page < totalPages) {
								fetchPage(page + 1).then((nextPageMergeRequests) => {
									resolve(mergeRequests.concat(nextPageMergeRequests));
								});
							} else {
								resolve(mergeRequests);
							}
						});
					})
					.catch((error) => {
						reject(error);
					});
			});
		}
		return fetchPage(1);
	}


	getNotes(projectId, mergeReqId) {
		const fetchPage = (page) => {
			return new Promise((resolve, reject) => {
				fetch(
					`${this.url}api/v4/projects/${projectId}/merge_requests/${mergeReqId}/notes?per_page=100&page=${page}`,
					{ headers: this.headers }
				)
					.then((res) => {
						const totalPages = parseInt(res.headers.get('X-Total-Pages'), 10);

						res.json().then((notes) => {
							if (page < totalPages) {
								fetchPage(page + 1).then((nextPageNotes) => {
									resolve(notes.concat(nextPageNotes));
								});
							} else {
								resolve(notes);
							}
						});
					})
					.catch((error) => {
						reject(error);
					});
			});
		}
		return fetchPage(1);
	}

	getDiscussions(projectId, mergeReqId) {
		const fetchPage = (page) => {
			return new Promise((resolve, reject) => {
				fetch(
					`${this.url}api/v4/projects/${projectId}/merge_requests/${mergeReqId}/discussions?per_page=100&page=${page}`,
					{ headers: this.headers }
				)
					.then((res) => {
						const totalPages = parseInt(res.headers.get('X-Total-Pages'), 10);

						res.json().then((notes) => {
							if (page < totalPages) {
								fetchPage(page + 1).then((nextPageNotes) => {
									resolve(notes.concat(nextPageNotes));
								});
							} else {
								resolve(notes);
							}
						});
					})
					.catch((error) => {
						reject(error);
					});
			});
		}
		return fetchPage(1);
	}
}

