import { Component, OnInit, OnDestroy, ComponentFactoryResolver, Injector, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { Subject } from 'rxjs';
import { filter, map, switchMap, tap } from 'rxjs/operators';

import {
    StoreHelperService,
    NewUrlStateNotificationService,
    UrlRouteManagerService,
    AgentHistogramDataService,
    DynamicPopupService,
    AnalyticsService,
    TRACKED_EVENT_LIST
} from 'app/shared/services';
import { Actions } from 'app/shared/store';
import { ServerMapData, IShortNodeInfo } from 'app/core/components/server-map/class/server-map-data.class';
import { ServerErrorPopupContainerComponent } from 'app/core/components/server-error-popup/server-error-popup-container.component';

@Component({
    selector: 'pp-info-per-server-container',
    templateUrl: './info-per-server-container.component.html',
    styleUrls: ['./info-per-server-container.component.css'],
    animations: [
        trigger('listAnimationTrigger', [
            state('start', style({
                left: '0px'
            })),
            state('end', style({
                left: '-825px'
            })),
            transition('* => *', [
                animate('0.2s 0s ease-out')
            ])
        ]),
        trigger('chartAnimationTrigger', [
            state('start', style({
                left: '0px'
            })),
            state('end', style({
                left: '-477px'
            })),
            transition('* => *', [
                animate('0.2s 0s ease-out')
            ])
        ]),
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InfoPerServerContainerComponent implements OnInit, OnDestroy {
    private unsubscribe = new Subject<void>();

    selectedTarget: ISelectedTarget;
    serverMapData: ServerMapData;
    agentHistogramData: any;
    selectedAgent: string;
    listAnimationTrigger = 'start';
    chartAnimationTrigger = 'start';

    constructor(
        private storeHelperService: StoreHelperService,
        private newUrlStateNotificationService: NewUrlStateNotificationService,
        private urlRouteManagerService: UrlRouteManagerService,
        private agentHistogramDataService: AgentHistogramDataService,
        private dynamicPopupService: DynamicPopupService,
        private analyticsService: AnalyticsService,
        private componentFactoryResolver: ComponentFactoryResolver,
        private injector: Injector,
        private cd: ChangeDetectorRef,
    ) {}

    ngOnInit() {
        this.connectStore();
    }

    ngOnDestroy() {
        this.unsubscribe.next();
        this.unsubscribe.complete();
    }

    private connectStore(): void {
        this.storeHelperService.getServerMapData(this.unsubscribe).pipe(
            filter((serverMapData: ServerMapData) => !!serverMapData),
        ).subscribe((serverMapData: ServerMapData) => {
            this.serverMapData = serverMapData;
        });

        this.storeHelperService.getServerMapTargetSelected(this.unsubscribe).pipe(
            filter((target: ISelectedTarget) => !!target)
        ).subscribe((target: ISelectedTarget) => {
            this.selectedTarget = target;
            this.selectedAgent = '';
            this.cd.detectChanges();
        });

        this.storeHelperService.getInfoPerServerState(this.unsubscribe).pipe(
            filter(() => this.selectedTarget && this.selectedTarget.isNode),
            filter((visibleState: boolean) => visibleState ? true : (this.hide(), this.cd.detectChanges(), false)),
            map(() => this.serverMapData.getNodeData(this.selectedTarget.node[0])),
            switchMap((node: INodeInfo | IShortNodeInfo) => {
                const range = [
                    this.newUrlStateNotificationService.getStartTimeToNumber(),
                    this.newUrlStateNotificationService.getEndTimeToNumber()
                ];

                return this.agentHistogramDataService.getData(node.key, node.applicationName, node.serviceTypeCode, this.serverMapData, range).pipe(
                    tap((histogramData = {}) => {
                        this.agentHistogramData = { isWas: node.isWas, ...histogramData };
                        this.onSelectAgent(this.selectedAgent ? this.selectedAgent : this.getFirstAgent());
                    })
                );
            })
        ).subscribe(() => {
            this.show();
            this.cd.detectChanges();
        }, (error: IServerErrorFormat) => {
            this.dynamicPopupService.openPopup({
                data: {
                    title: 'Error',
                    contents: error
                },
                component: ServerErrorPopupContainerComponent
            }, {
                resolver: this.componentFactoryResolver,
                injector: this.injector
            });
            this.storeHelperService.dispatch(new Actions.ChangeServerMapDisableState(false));
            this.cd.detectChanges();
        });
    }

    private hide(): void {
        this.listAnimationTrigger = 'start';
        this.chartAnimationTrigger = 'start';
    }

    private show(): void {
        this.listAnimationTrigger = 'end';
        this.chartAnimationTrigger = 'end';
    }

    private getFirstAgent(): string {
        const firstKey = Object.keys(this.agentHistogramData['serverList']).sort()[0];

        return Object.keys(this.agentHistogramData['serverList'][firstKey]['instanceList']).sort()[0];
    }

    onSelectAgent(agent: string): void {
        this.analyticsService.trackEvent(TRACKED_EVENT_LIST.SELECT_AGENT);
        this.storeHelperService.dispatch(new Actions.ChangeAgentForServerList({
            agent,
            responseSummary: this.agentHistogramData['agentHistogram'][agent],
            load: this.agentHistogramData['agentTimeSeriesHistogram'][agent]
        }));
        this.selectedAgent = agent;
    }

    onOpenInspector(agent: string): void {
        this.analyticsService.trackEvent(TRACKED_EVENT_LIST.OPEN_INSPECTOR_WITH_AGENT);
        this.urlRouteManagerService.openInspectorPage(false, agent);
    }
}
