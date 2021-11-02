const { WebcController } = WebCardinal.controllers;

const cscServices = require('csc-services');
const KitsService = cscServices.KitsService;
const eventBusService = cscServices.EventBusService;
const momentService = cscServices.momentService;
const SearchService = cscServices.SearchService;
const { Topics, Commons } = cscServices.constants;
const { kitsTableHeaders, kitsStatusesEnum } = cscServices.constants.kit;
const statusesService = cscServices.StatusesService;

class KitsControllerImpl extends WebcController {

	constructor(role, ...props) {
		super(...props);

		this.kitsService = new KitsService(this.DSUStorage);
		this.searchService = new SearchService(kitsStatusesEnum, ['kitId','shipmentId','investigatorId']);
		this.model = this.getKitsViewModel();
		this.model.kitsListIsReady = false;
		this.attachEvents();
		this.init();
	}

	async init() {
		let { studyId, orderId } = this.history.location.state;
		this.model.studyId = studyId;
		this.model.orderId = orderId;
		await this.getKits();
		eventBusService.addEventListener(Topics.RefreshKits, async (data) => {
			await this.getKits();
		});
	}

	async getKits() {
		try {
			this.model.kitsListIsReady = false;
			const orderKits = await this.kitsService.getOrderKits(this.model.studyId, this.model.orderId);
			this.kits = this.transformData(orderKits);
			this.setKitsModel(this.kits);
			this.model.kitsListIsReady = true;
		} catch (error) {
			console.log(error);
		}
	}

	transformData(data) {
		if (data) {
			data.forEach((item) => {

				const receivedStatus = item.status[0];
				const latestStatus = item.status.sort(function(a, b) {
					return new Date(b.date) - new Date(a.date);
				})[0];

				item.investigatorId = item.investigatorId ? item.investigatorId : '-';
				const statuses = statusesService.getKitStatuses();
				const normalStatuses = statuses.normalKitStatuses;
				const approvedStatuses = statuses.approvedKitStatuses;
				item.status_value = latestStatus.status;
				item.receivedDate = momentService(receivedStatus.date).format(Commons.DateTimeFormatPattern);
				item.lastModified = latestStatus.date ? momentService(latestStatus.date).format(Commons.DateTimeFormatPattern) : '-';
				item.status_approved = approvedStatuses.indexOf(item.status_value) !== -1;
				item.status_normal = normalStatuses.indexOf(item.status_value) !== -1;

			});

		}
		return data;
	}

	attachEvents() {
		this.attachExpressionHandlers();
		this.viewKitHandler();
		this.searchFilterHandler();
		this.filterChangedHandler();
    	this.filterClearedHandler();

		this.onTagClick('dashboard', () => {
			this.navigateToPageTag('dashboard');
		});

		this.onTagClick('kits-management', () => {
			this.navigateToPageTag('dashboard', { tab: Topics.Kits });
		});
	}

	attachExpressionHandlers() {
		this.model.addExpression('kitsListNotEmpty', () => {
			return this.model.kits && Array.isArray(this.model.kits) && this.model.kits.length > 0;
		}, 'kits');
	}

	async viewKitHandler() {
		this.onTagClick('view-kit', async (model) => {
			this.navigateToPageTag('kit', { keySSI: model.keySSI });
		});
	}

	searchFilterHandler() {
		this.model.onChange('search.value', () => {
			setTimeout(() => {
				this.filterData();
			}, 300);
		});
	}

	filterChangedHandler() {
		this.onTagClick('filters-changed', async (model, target) => {
		  const selectedFilter = target.getAttribute('data-custom') || null;
		  if (selectedFilter) {
			this.querySelector(`#filter-${this.model.filter}`).classList.remove('selected');
			this.model.filter = selectedFilter;
			this.querySelector(`#filter-${this.model.filter}`).classList.add('selected');
			this.filterData();
		  }
		});
	  }
	
	  filterClearedHandler() {
		this.onTagClick('filters-cleared', async () => {
		  this.querySelector(`#filter-${this.model.filter}`).classList.remove('selected');
		  this.model.filter = '';
		  this.querySelector(`#filter-${this.model.filter}`).classList.add('selected');
		  this.model.search.value = null;
		  this.filterData();
		});
	  }

	filterData() {
		let result = this.kits;
		result = this.searchService.filterData(result, this.model.filter, this.model.search.value);
		this.setKitsModel(result);
	}

	setKitsModel(kits) {
		this.model.kits = kits;
		this.model.data = kits;
		this.model.headers = this.model.headers.map((x) => ({ ...x, asc: false, desc: false }));
	}

	getKitsViewModel() {
		return {
			filter: '',
			search: this.getSearchViewModel(),
			kits: [],
			kitsListNotEmpty: true,
			pagination: this.getPaginationViewModel(),
			headers: kitsTableHeaders,
			tableLength: kitsTableHeaders.length,
			defaultSortingRule: {
				sorting: 'desc',
				column: "lastModified",
				type : 'date'
			}

		};
	}

	getPaginationViewModel() {
		const itemsPerPageArray = [5, 10, 15, 20, 30];

		return {
			previous: false,
			next: false,
			items: [],
			pages: {
				selectOptions: ''
			},
			slicedPages: [],
			currentPage: 0,
			itemsPerPage: 10,
			totalPages: null,
			itemsPerPageOptions: {
				selectOptions: itemsPerPageArray.join(' | '),
				value: itemsPerPageArray[1].toString()
			}
		};
	}

	getSearchViewModel() {
		return {
			placeholder: 'Search',
			value: ''
		};
	}
}

const controllersRegistry = require('../ControllersRegistry').getControllersRegistry();
controllersRegistry.registerController('KitsController', KitsControllerImpl);
