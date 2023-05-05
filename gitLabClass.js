'use strict';
import fetch from 'node-fetch';

export class GitLab {

	constructor(url, headers) {
			this.url = new URL(url);
			this.headers = headers;
	}

	getMergeRequests(projectId, startDate, endDate) {
		return new Promise((resolve, reject) => {
			fetch(`${this.url.href}/projects/${projectId}/merge_requests?created_after=${startDate}&created_before=${endDate}`, { headers: this.headers } )
			.then(res => res.json())
			.then(mergeRequests => {
					resolve(mergeRequests)
			})
				.catch(error => {
					reject(error);
			})
		})
	}


	getApprovals(projectId, mergeReqId) {
		return new Promise((resolve, reject) => {
			fetch(`${this.url.href}/projects/${projectId}/merge_requests/${mergeReqId}/approval_state`, { headers: this.headers } )
			.then(res => res.json())
			.then(approvalState => {
					resolve(approvalState)
			})
				.catch(error => {
					reject(error);
			})
		})
	}

	getNotes(projectId, mergeReqId) {
		return new Promise((resolve, reject) => {
			fetch(`${this.url.href}/projects/${projectId}/merge_requests/${mergeReqId}/notes`, { headers: this.headers } )
			.then(res => res.json())
			.then(notes => {
					resolve(notes)
			})
				.catch(error => {
					reject(error);
			})
		})
	}
}

